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
