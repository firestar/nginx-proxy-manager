/**
 * Minimal AWS Signature V4 S3 client.
 *
 * No SDK dependency: just node:crypto for signing and the global fetch for
 * transport. Uses path-style addressing (`{endpoint}/{bucket}/{key}`) so it
 * works against MinIO and other S3-compatible servers with an endpoint
 * override. Only the three operations the backup scheduler needs are
 * implemented: putObject, listObjects (ListObjectsV2) and deleteObject.
 *
 * @typedef {Object} S3Config
 * @property {string} endpoint     e.g. "https://s3.amazonaws.com" or "http://minio:9000"
 * @property {string} region       e.g. "us-east-1"
 * @property {string} bucket
 * @property {string} access_key
 * @property {string} secret_key
 * @property {string} [prefix]
 */

import crypto from "node:crypto";

const EMPTY_SHA256 = crypto.createHash("sha256").update("").digest("hex");

const sha256hex = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/** RFC3986 URI encoding. Optionally leaves "/" unescaped (for object keys). */
const uriEncode = (str, encodeSlash = true) =>
	String(str)
		.split("")
		.map((ch) => {
			if (/[A-Za-z0-9\-_.~]/.test(ch)) {
				return ch;
			}
			if (ch === "/" && !encodeSlash) {
				return ch;
			}
			return Array.from(Buffer.from(ch, "utf8"))
				.map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`)
				.join("");
		})
		.join("");

const amzDates = (now = new Date()) => {
	const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
	return { amzDate: iso, dateStamp: iso.slice(0, 8) };
};

const signingKey = (secret, dateStamp, region, service) => {
	const kDate = hmac(`AWS4${secret}`, dateStamp);
	const kRegion = hmac(kDate, region);
	const kService = hmac(kRegion, service);
	return hmac(kService, "aws4_request");
};

/**
 * Sign and send one S3 request.
 * @param {S3Config} cfg
 * @param {{method: string, key?: string, query?: Record<string,string>, body?: Buffer, headers?: Record<string,string>}} req
 * @returns {Promise<Response>}
 */
const send = async (cfg, req) => {
	const region = cfg.region || "us-east-1";
	const service = "s3";
	const base = new URL(cfg.endpoint);
	const body = req.body ?? Buffer.alloc(0);
	const payloadHash = req.body ? sha256hex(body) : EMPTY_SHA256;

	// Path-style: /{bucket}/{key}
	const keyPath = req.key ? `/${uriEncode(req.key, false)}` : "";
	const canonicalUri = `${base.pathname.replace(/\/$/, "")}/${cfg.bucket}${keyPath}` || "/";

	const query = req.query || {};
	const canonicalQuery = Object.keys(query)
		.sort()
		.map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
		.join("&");

	const { amzDate, dateStamp } = amzDates();
	const host = base.host;
	const headers = {
		host,
		"x-amz-content-sha256": payloadHash,
		"x-amz-date": amzDate,
		...(req.headers || {}),
	};
	const signedHeaderNames = Object.keys(headers)
		.map((h) => h.toLowerCase())
		.sort();
	const canonicalHeaders = `${signedHeaderNames
		.map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}`)
		.join("\n")}\n`;
	const signedHeaders = signedHeaderNames.join(";");

	const canonicalRequest = [
		req.method,
		canonicalUri,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");

	const scope = `${dateStamp}/${region}/${service}/aws4_request`;
	const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
	const signature = crypto.createHmac("sha256", signingKey(cfg.secret_key, dateStamp, region, service))
		.update(stringToSign)
		.digest("hex");

	const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.access_key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

	const url = `${base.origin}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
	const res = await fetch(url, {
		method: req.method,
		headers: { ...headers, Authorization: authorization },
		body: req.method === "GET" || req.method === "DELETE" ? undefined : body,
	});
	return res;
};

const assertOk = async (res, action) => {
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`S3 ${action} failed: HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`.trim());
	}
	return res;
};

/**
 * Upload an object.
 * @param {S3Config} cfg
 * @param {string} key
 * @param {Buffer} body
 * @returns {Promise<void>}
 */
export const putObject = async (cfg, key, body) => {
	const res = await send(cfg, {
		method: "PUT",
		key,
		body,
		headers: { "content-type": "application/octet-stream", "content-length": String(body.length) },
	});
	await assertOk(res, "PUT");
};

/**
 * List objects under a prefix (ListObjectsV2, paginated).
 * @param {S3Config} cfg
 * @param {string} prefix
 * @returns {Promise<Array<{key: string, size: number, lastModified: string}>>}
 */
export const listObjects = async (cfg, prefix) => {
	const objects = [];
	let token;
	do {
		const query = { "list-type": "2", prefix: prefix || "" };
		if (token) {
			query["continuation-token"] = token;
		}
		const res = await send(cfg, { method: "GET", query });
		await assertOk(res, "LIST");
		const xml = await res.text();
		const re = /<Contents>([\s\S]*?)<\/Contents>/g;
		let m;
		while ((m = re.exec(xml)) !== null) {
			const block = m[1];
			const key = (block.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1];
			const size = Number.parseInt((block.match(/<Size>(\d+)<\/Size>/) || [])[1] || "0", 10);
			const lastModified = (block.match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1] || "";
			if (key) {
				objects.push({ key, size, lastModified });
			}
		}
		const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
		token = truncated ? (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1] : undefined;
	} while (token);
	return objects;
};

/**
 * Delete an object.
 * @param {S3Config} cfg
 * @param {string} key
 * @returns {Promise<void>}
 */
export const deleteObject = async (cfg, key) => {
	const res = await send(cfg, { method: "DELETE", key });
	await assertOk(res, "DELETE");
};

export default { putObject, listObjects, deleteObject, uriEncode };
