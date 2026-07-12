/**
 * Backup archive helpers.
 *
 * An archive is a gzipped tar built from an ordered list of entries
 * ({ name, data }). When a passphrase is supplied the gzipped bytes are
 * wrapped with AES-256-GCM: a small self-describing header carries the
 * scrypt salt, the GCM nonce (iv) and the auth tag, so the private key
 * material inside the tar is encrypted at rest.
 *
 * Plain archives begin with the gzip magic (0x1f 0x8b); encrypted archives
 * begin with ENC_MAGIC, which is how unpack() tells them apart.
 */

import crypto from "node:crypto";
import zlib from "node:zlib";
import tarStream from "tar-stream";

const ENC_MAGIC = Buffer.from("NPMBKENC", "utf8"); // 8 bytes
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT_KEYLEN = 32;

const gzip = (buf) =>
	new Promise((resolve, reject) => {
		zlib.gzip(buf, (err, out) => (err ? reject(err) : resolve(out)));
	});

const gunzip = (buf) =>
	new Promise((resolve, reject) => {
		zlib.gunzip(buf, (err, out) => (err ? reject(err) : resolve(out)));
	});

const deriveKey = (passphrase, salt) =>
	new Promise((resolve, reject) => {
		crypto.scrypt(String(passphrase), salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
	});

/**
 * Encrypt gzipped bytes into the self-describing NPMBKENC container.
 * @param {Buffer} plain
 * @param {string} passphrase
 * @returns {Promise<Buffer>}
 */
const encrypt = async (plain, passphrase) => {
	const salt = crypto.randomBytes(SALT_LEN);
	const iv = crypto.randomBytes(IV_LEN);
	const key = await deriveKey(passphrase, salt);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([ENC_MAGIC, salt, iv, tag, ciphertext]);
};

/**
 * Reverse of encrypt(). Throws if the passphrase is wrong (GCM auth fails).
 * @param {Buffer} buf
 * @param {string} passphrase
 * @returns {Promise<Buffer>}
 */
const decrypt = async (buf, passphrase) => {
	let off = ENC_MAGIC.length;
	const salt = buf.subarray(off, (off += SALT_LEN));
	const iv = buf.subarray(off, (off += IV_LEN));
	const tag = buf.subarray(off, (off += TAG_LEN));
	const ciphertext = buf.subarray(off);
	const key = await deriveKey(passphrase, salt);
	const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

/** @returns {boolean} whether the buffer is an encrypted (NPMBKENC) archive. */
export const isEncrypted = (buf) => Buffer.isBuffer(buf) && buf.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC);

/**
 * Build a gzipped (optionally encrypted) tar from ordered entries.
 * @param {Array<{name: string, data: Buffer|string}>} entries
 * @param {{passphrase?: string}} [opts]
 * @returns {Promise<Buffer>}
 */
export const pack = async (entries, opts = {}) => {
	const pack = tarStream.pack();
	const chunks = [];
	pack.on("data", (c) => chunks.push(c));
	const done = new Promise((resolve, reject) => {
		pack.on("end", resolve);
		pack.on("error", reject);
	});

	for (const entry of entries) {
		const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
		await new Promise((resolve, reject) => {
			pack.entry({ name: entry.name }, data, (err) => (err ? reject(err) : resolve()));
		});
	}
	pack.finalize();
	await done;

	const tar = Buffer.concat(chunks);
	const gzipped = await gzip(tar);
	if (opts.passphrase) {
		return encrypt(gzipped, opts.passphrase);
	}
	return gzipped;
};

/**
 * Extract an archive built by pack() back into a name -> Buffer map.
 * @param {Buffer} buf
 * @param {{passphrase?: string}} [opts]
 * @returns {Promise<Map<string, Buffer>>}
 */
export const unpack = async (buf, opts = {}) => {
	let gzipped = buf;
	if (isEncrypted(buf)) {
		if (!opts.passphrase) {
			throw new Error("Archive is encrypted but no passphrase was provided");
		}
		gzipped = await decrypt(buf, opts.passphrase);
	}
	const tar = await gunzip(gzipped);

	const extract = tarStream.extract();
	const out = new Map();
	const done = new Promise((resolve, reject) => {
		extract.on("entry", (header, stream, next) => {
			const parts = [];
			stream.on("data", (c) => parts.push(c));
			stream.on("end", () => {
				out.set(header.name, Buffer.concat(parts));
				next();
			});
			stream.on("error", reject);
			stream.resume();
		});
		extract.on("finish", resolve);
		extract.on("error", reject);
	});
	extract.end(tar);
	await done;
	return out;
};

export default { pack, unpack, isEncrypted };
