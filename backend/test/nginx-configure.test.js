import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Integration test for internalNginx.configure() rollback behaviour.
 *
 * We can't test the real nginx binary in unit tests, so we test the helper
 * functions (filterFatalLines) and the config-file backup/restore logic by
 * exercising configure() with mocked test() and model.
 */

import internalNginxModule from "../internal/nginx.js";
const internalNginx = internalNginxModule;

describe("filterFatalLines", () => {
	it("keeps [emerg] lines", () => {
		const msg = "nginx: [emerg] unknown directive\nnginx: [warn] something else";
		assert.ok(internalNginx.filterFatalLines(msg).includes("[emerg]"));
		assert.ok(!internalNginx.filterFatalLines(msg).includes("[warn]"));
	});

	it("keeps [crit] lines", () => {
		const msg = "nginx: [crit] critical error\nnginx: [warn] ignored";
		assert.ok(internalNginx.filterFatalLines(msg).includes("[crit]"));
	});

	it("strips docker /var/log/nginx/error.log false-positive", () => {
		const msg = "nginx: [alert] could not open error log file: open() \"/var/log/nginx/error.log\" failed\nnginx: [emerg] real error";
		const result = internalNginx.filterFatalLines(msg);
		assert.ok(!result.includes("/var/log/nginx/error.log"));
		assert.ok(result.includes("[emerg]"));
	});

	it("falls back to all non-false-positive lines when no fatal lines exist", () => {
		const msg = "nginx: [warn] just a warning";
		assert.ok(internalNginx.filterFatalLines(msg).includes("[warn]"));
	});
});

describe("renderHostConfig", () => {
	it("is an alias for renderConfig", async () => {
		const mockConfig = "# rendered nginx config";
		const restore = mock.method(internalNginx, "renderConfig", async () => mockConfig);
		try {
			const result = await internalNginx.renderHostConfig("proxy_host", { id: 1 });
			assert.strictEqual(result, mockConfig);
			assert.strictEqual(restore.mock.calls.length, 1);
		} finally {
			restore.mock.restore();
		}
	});
});

describe("testHostConfig", () => {
	let tmpDir;
	let tmpFile;
	const ORIGINAL_CONTENT = "# original nginx config";

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-test-"));
		tmpFile = path.join(tmpDir, "test.conf");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("restores original config when nginx test fails (existing host)", async () => {
		fs.writeFileSync(tmpFile, ORIGINAL_CONTENT, "utf8");

		const mockGetConfigName = mock.method(internalNginx, "getConfigName", () => tmpFile);
		const mockGenerateConfig = mock.method(internalNginx, "generateConfig", async () => {
			fs.writeFileSync(tmpFile, "garbage config", "utf8");
		});
		const mockTest = mock.method(internalNginx, "test", async () => {
			throw new Error("nginx: [emerg] unknown directive \"garbage\"");
		});

		try {
			const result = await internalNginx.testHostConfig("proxy_host", { id: 1 });
			assert.strictEqual(result.ok, false);
			assert.ok(result.errors.includes("[emerg]"));
			// Original content must be restored
			assert.strictEqual(fs.readFileSync(tmpFile, "utf8"), ORIGINAL_CONTENT);
			// No stale .bak file
			assert.ok(!fs.existsSync(`${tmpFile}.bak`));
		} finally {
			mockGetConfigName.mock.restore();
			mockGenerateConfig.mock.restore();
			mockTest.mock.restore();
		}
	});

	it("returns ok:true and removes candidate file for a new host when test passes", async () => {
		const mockGetConfigName = mock.method(internalNginx, "getConfigName", () => tmpFile);
		const mockGenerateConfig = mock.method(internalNginx, "generateConfig", async () => {
			fs.writeFileSync(tmpFile, "valid nginx config", "utf8");
		});
		const mockTest = mock.method(internalNginx, "test", async () => {});

		try {
			const result = await internalNginx.testHostConfig("proxy_host", { id: 0 });
			assert.strictEqual(result.ok, true);
			// Candidate file deleted (new host — did not exist before)
			assert.ok(!fs.existsSync(tmpFile));
		} finally {
			mockGetConfigName.mock.restore();
			mockGenerateConfig.mock.restore();
			mockTest.mock.restore();
		}
	});
});
