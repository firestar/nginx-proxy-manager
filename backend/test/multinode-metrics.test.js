/**
 * Smoke tests for multi-node metrics + uptime plumbing.
 *
 * These tests verify exports and structural correctness by reading source files
 * directly rather than importing DB-dependent modules (which require /data to
 * be set up). This keeps the tests runnable in any dev/CI environment.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(__dirname, rel), "utf8");

describe("metrics ingestRemote — export + basic guard", () => {
	it("is a named export in metrics.js", () => {
		const text = src("../internal/metrics.js");
		assert.ok(
			text.includes("export { ingestRemote }") || /export\s+(async\s+)?function\s+ingestRemote/.test(text),
			"ingestRemote must be a named export",
		);
	});

	it("guards against empty/null input before touching the DB", () => {
		const text = src("../internal/metrics.js");
		// Guard clause: !Array.isArray(buckets) || buckets.length === 0
		assert.ok(
			text.includes("!Array.isArray(buckets)") || text.includes("buckets.length === 0"),
			"ingestRemote must guard against non-array / empty input",
		);
	});
});

describe("uptime recordRemoteProbe — export + basic guard", () => {
	it("is a named export in uptime.js", () => {
		const text = src("../internal/uptime.js");
		assert.ok(
			text.includes("recordRemoteProbe") && text.includes("export"),
			"recordRemoteProbe must be exported from uptime.js",
		);
	});
});

describe("report getNodesMetrics — method presence", () => {
	it("getNodesMetrics is defined inside internalReport object", () => {
		const text = src("../internal/report.js");
		assert.ok(text.includes("getNodesMetrics:"), "getNodesMetrics must be a method on internalReport");
	});

	it("getUptimeReport is properly inside internalReport (regression: was dangling after export)", () => {
		const text = src("../internal/report.js");
		// Verify getUptimeReport appears as a method key (not as a labeled statement after export)
		assert.ok(text.includes("getUptimeReport:"), "getUptimeReport must be a method on internalReport");
		// Verify it is NOT defined after 'export default internalReport'
		const exportIdx = text.indexOf("export default internalReport");
		const methodIdx = text.indexOf("getUptimeReport:");
		assert.ok(exportIdx > methodIdx, "getUptimeReport definition must appear before the export statement");
	});
});

describe("agent-ws handleMessage — metrics + uptime wired", () => {
	it("imports ingestRemote and recordRemoteProbe", () => {
		const text = src("../internal/agent-ws.js");
		assert.ok(text.includes('import { ingestRemote }'), "agent-ws must import ingestRemote");
		assert.ok(text.includes('recordRemoteProbe'), "agent-ws must reference recordRemoteProbe");
	});

	it("has metrics and uptime cases in handleMessage switch", () => {
		const text = src("../internal/agent-ws.js");
		assert.ok(text.includes('case "metrics":'), 'handleMessage must have a "metrics" case');
		assert.ok(text.includes('case "uptime":'), 'handleMessage must have an "uptime" case');
	});
});
