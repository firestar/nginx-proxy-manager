import { describe, it } from "node:test";
import assert from "node:assert/strict";
// Import the agent's uptime module directly (same pattern as agent-apply.test.js)
import { initTimer, updateChecks } from "../../agent/uptime.js";

// parseExpectedStatus is not exported from agent/uptime.js, so test via message shape
// and the exported updateChecks / initTimer surface.

describe("agent uptime updateChecks", () => {
	it("accepts an array of checks without throwing", () => {
		assert.doesNotThrow(() => {
			updateChecks([{ id: 1, forward_scheme: "http", forward_host: "localhost", forward_port: 80, check_path: "/", check_interval_s: 60, expected_status: "200-399", domain_names: ["example.com"] }]);
		});
	});

	it("accepts empty array", () => {
		assert.doesNotThrow(() => updateChecks([]));
	});

	it("accepts null/undefined gracefully", () => {
		assert.doesNotThrow(() => updateChecks(null));
		assert.doesNotThrow(() => updateChecks(undefined));
	});
});

describe("agent uptime initTimer", () => {
	it("returns a timer handle", () => {
		updateChecks([]); // no checks to probe
		const handle = initTimer(() => false);
		assert.ok(handle, "timer handle returned");
		clearInterval(handle);
	});
});
