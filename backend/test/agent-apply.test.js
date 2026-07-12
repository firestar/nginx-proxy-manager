import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Tests for the npm-agent staged apply logic (agent/apply.js):
 * stage bundle -> atomic symlink swap -> nginx -t -> reload or rollback.
 *
 * The nginx binary is stubbed with /bin/true (accepts) or /bin/false
 * (rejects). NGINX_BIN and AGENT_LIVE_LINK are read at module load, so each
 * scenario imports a fresh module instance via a query-string cache-buster.
 */

let importCounter = 0;
const loadApply = async (nginxBin, liveLink) => {
	process.env.NGINX_BIN = nginxBin;
	process.env.AGENT_LIVE_LINK = liveLink;
	importCounter++;
	return await import(`../../agent/apply.js?i=${importCounter}`);
};

const makeDataDir = (tmp) => {
	const dataDir = path.join(tmp, "agent");
	const v0 = path.join(dataDir, "snapshots", "v0");
	fs.mkdirSync(path.join(v0, "proxy_host"), { recursive: true });
	const liveLink = path.join(tmp, "nginx");
	fs.symlinkSync(v0, liveLink);
	return { dataDir, liveLink, v0 };
};

describe("agent applySnapshot", () => {
	let tmp;
	before(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "npm-agent-test-"));
	});
	after(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("stages configs, swaps the symlink and reloads on nginx -t success", async () => {
		const { dataDir, liveLink } = makeDataDir(fs.mkdtempSync(path.join(tmp, "ok-")));
		const { applySnapshot } = await loadApply("/bin/true", liveLink);

		await applySnapshot(dataDir, {
			version: 1,
			configs: { "proxy_host/1.conf": "server { listen 80; }" },
			files: {},
		});

		const target = fs.readlinkSync(liveLink);
		assert.ok(target.endsWith(path.join("snapshots", "v1")));
		const conf = fs.readFileSync(path.join(liveLink, "proxy_host", "1.conf"), "utf8");
		assert.equal(conf, "server { listen 80; }");
	});

	it("rolls the symlink back to the previous snapshot when nginx -t fails", async () => {
		const { dataDir, liveLink, v0 } = makeDataDir(fs.mkdtempSync(path.join(tmp, "fail-")));
		const { applySnapshot } = await loadApply("/bin/false", liveLink);

		await assert.rejects(() =>
			applySnapshot(dataDir, {
				version: 2,
				configs: { "proxy_host/1.conf": "server { broken" },
				files: {},
			}),
		);

		// rollback restored the previous target; running nginx was never reloaded
		assert.equal(fs.readlinkSync(liveLink), v0);
	});

	it("rejects config paths that escape the snapshot dir", async () => {
		const { dataDir, liveLink } = makeDataDir(fs.mkdtempSync(path.join(tmp, "trav-")));
		const { applySnapshot } = await loadApply("/bin/true", liveLink);

		await assert.rejects(
			() =>
				applySnapshot(dataDir, {
					version: 3,
					configs: { "../evil.conf": "x" },
					files: {},
				}),
			/Unsafe config path/,
		);
	});

	it("refuses side files outside the allowed prefixes", async () => {
		const { dataDir, liveLink } = makeDataDir(fs.mkdtempSync(path.join(tmp, "allow-")));
		const { applySnapshot } = await loadApply("/bin/true", liveLink);

		await assert.rejects(
			() =>
				applySnapshot(dataDir, {
					version: 4,
					configs: {},
					files: { "/etc/shadow": Buffer.from("nope").toString("base64") },
				}),
			/allowed paths/,
		);
	});
});

describe("agent filterFatalLines", () => {
	it("keeps only [emerg]/[crit] lines and strips the docker error.log false-positive", async () => {
		const { filterFatalLines } = await loadApply("/bin/true", path.join(os.tmpdir(), "unused-link"));
		const msg = [
			'nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed',
			"nginx: [warn] noise",
			"nginx: [emerg] unknown directive",
		].join("\n");
		const out = filterFatalLines(msg);
		assert.ok(out.includes("[emerg]"));
		assert.ok(!out.includes("[warn]"));
		assert.ok(!out.includes("/var/log/nginx/error.log"));
	});
});
