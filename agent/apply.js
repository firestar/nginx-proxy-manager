import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NGINX_BIN = process.env.NGINX_BIN || "nginx";
// nginx.conf includes /data/nginx/<type>/*.conf; /data/nginx is a symlink to
// the currently active snapshot directory.
const LIVE_LINK = process.env.AGENT_LIVE_LINK || "/data/nginx";
const CONF_TYPES = ["default_host", "default_www", "proxy_host", "redirection_host", "stream", "dead_host", "temp", "custom"];
// Side files (certs, htpasswd) are written to the absolute paths the rendered
// configs reference — but never anywhere else.
const ALLOWED_FILE_PREFIXES = ["/etc/letsencrypt/live/", "/data/custom_ssl/", "/data/access/"];
const KEEP_SNAPSHOTS = 3;

const exec = (bin, args) =>
	new Promise((resolve, reject) => {
		execFile(bin, args, (err, stdout, stderr) => {
			if (err) {
				err.message = `${stdout}\n${stderr}`.trim() || err.message;
				reject(err);
				return;
			}
			resolve(`${stdout}\n${stderr}`.trim());
		});
	});

// Same filtering the panel uses for local applies (P1): only [emerg]/[crit]
// lines matter for the ack; drop the docker error.log false-positive.
export const filterFatalLines = (msg) => {
	const lines = String(msg)
		.split("\n")
		.filter((l) => l.indexOf("/var/log/nginx/error.log") === -1);
	const fatal = lines.filter((l) => l.includes("[emerg]") || l.includes("[crit]"));
	return (fatal.length ? fatal : lines).join("\n").trim();
};

const nginxTest = () => exec(NGINX_BIN, ["-t", "-g", "error_log off;"]);
const nginxReload = () => exec(NGINX_BIN, ["-s", "reload"]);

const readLinkTarget = (linkPath) => {
	try {
		return fs.readlinkSync(linkPath);
	} catch (_) {
		return null;
	}
};

// Swap by building a temp symlink and renaming it over the live one, so there
// is never a moment where /data/nginx doesn't resolve.
const swapLink = (linkPath, target) => {
	const tmp = `${linkPath}.tmp`;
	fs.rmSync(tmp, { force: true });
	fs.symlinkSync(target, tmp);
	fs.renameSync(tmp, linkPath);
};

const pruneSnapshots = (snapshotsDir, currentVersion) => {
	try {
		const versions = fs
			.readdirSync(snapshotsDir)
			.filter((e) => /^v\d+$/.test(e))
			.map((e) => Number(e.slice(1)))
			.sort((a, b) => b - a);
		for (let i = 0; i < versions.length; i++) {
			const v = versions[i];
			// keep the newest KEEP_SNAPSHOTS plus v0 (the empty initial snapshot)
			if (i >= KEEP_SNAPSHOTS && v !== 0 && v !== currentVersion) {
				fs.rmSync(path.join(snapshotsDir, `v${v}`), { recursive: true, force: true });
			}
		}
	} catch (_) {
		// pruning is best-effort
	}
};

/**
 * Apply a config snapshot:
 *  1. write the bundle to a fresh versioned snapshot dir,
 *  2. write referenced cert/access files to their absolute paths,
 *  3. atomically repoint the live symlink at the staged snapshot,
 *  4. nginx -t (validates the staged tree; the RUNNING nginx is untouched
 *     because no reload has happened),
 *  5. on success reload; on failure repoint the symlink back (rollback) and
 *     throw with the fatal lines for the ack.
 *
 * @param {String} dataDir  agent data dir (default /data/agent)
 * @param {Object} cfg      {version, configs: {rel: text}, files: {abs: b64}}
 */
export const applySnapshot = async (dataDir, cfg) => {
	const snapshotsDir = path.join(dataDir, "snapshots");
	const newDir = path.join(snapshotsDir, `v${cfg.version}`);

	fs.rmSync(newDir, { recursive: true, force: true });
	for (const type of CONF_TYPES) {
		fs.mkdirSync(path.join(newDir, type), { recursive: true });
	}

	for (const [rel, text] of Object.entries(cfg.configs || {})) {
		const target = path.join(newDir, rel);
		if (!target.startsWith(newDir + path.sep)) {
			throw new Error(`Unsafe config path in bundle: ${rel}`);
		}
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, text, "utf8");
	}

	for (const [abs, b64] of Object.entries(cfg.files || {})) {
		const norm = path.normalize(abs);
		if (!ALLOWED_FILE_PREFIXES.some((prefix) => norm.startsWith(prefix))) {
			throw new Error(`Refusing to write file outside allowed paths: ${abs}`);
		}
		fs.mkdirSync(path.dirname(norm), { recursive: true });
		fs.writeFileSync(norm, Buffer.from(b64, "base64"), { mode: 0o600 });
	}

	const prevTarget = readLinkTarget(LIVE_LINK);
	swapLink(LIVE_LINK, newDir);

	try {
		await nginxTest();
	} catch (err) {
		// Rollback: repoint at the previous snapshot. The running nginx was
		// never reloaded, so live traffic is unaffected.
		if (prevTarget) {
			swapLink(LIVE_LINK, prevTarget);
		}
		throw new Error(filterFatalLines(err.message));
	}

	await nginxReload();
	pruneSnapshots(snapshotsDir, cfg.version);
	return true;
};
