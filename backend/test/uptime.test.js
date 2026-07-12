import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseExpectedStatus, computeDowntimeMs, uptimePercent } from "../internal/uptime-helpers.js";

describe("parseExpectedStatus", () => {
	it("matches a single code", () => {
		const ok = parseExpectedStatus("200");
		assert.equal(ok(200), true);
		assert.equal(ok(201), false);
	});

	it("matches a range", () => {
		const ok = parseExpectedStatus("200-399");
		assert.equal(ok(200), true);
		assert.equal(ok(301), true);
		assert.equal(ok(399), true);
		assert.equal(ok(400), false);
	});

	it("matches comma-separated values", () => {
		const ok = parseExpectedStatus("200,301,404");
		assert.equal(ok(200), true);
		assert.equal(ok(301), true);
		assert.equal(ok(404), true);
		assert.equal(ok(500), false);
	});

	it("matches range and single combined", () => {
		const ok = parseExpectedStatus("200-299,404");
		assert.equal(ok(250), true);
		assert.equal(ok(404), true);
		assert.equal(ok(500), false);
	});
});

describe("computeDowntimeMs", () => {
	const ONE_HOUR = 60 * 60 * 1000;
	const now = 1_000_000_000_000; // fixed reference point

	const dtStr = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

	it("returns 0 for empty events", () => {
		assert.equal(computeDowntimeMs([], now - ONE_HOUR, now), 0);
	});

	it("counts a closed downtime event fully inside window", () => {
		const events = [{ started_on: dtStr(now - 30 * 60 * 1000), ended_on: dtStr(now - 10 * 60 * 1000) }];
		const result = computeDowntimeMs(events, now - ONE_HOUR, now);
		assert.equal(result, 20 * 60 * 1000);
	});

	it("clamps event to window start", () => {
		const events = [{ started_on: dtStr(now - 2 * ONE_HOUR), ended_on: dtStr(now - 30 * 60 * 1000) }];
		const result = computeDowntimeMs(events, now - ONE_HOUR, now);
		assert.equal(result, 30 * 60 * 1000);
	});

	it("treats open event (ended_on=null) as ending at now", () => {
		const events = [{ started_on: dtStr(now - 30 * 60 * 1000), ended_on: null }];
		const result = computeDowntimeMs(events, now - ONE_HOUR, now);
		assert.equal(result, 30 * 60 * 1000);
	});

	it("excludes event entirely outside window", () => {
		const events = [{ started_on: dtStr(now - 3 * ONE_HOUR), ended_on: dtStr(now - 2 * ONE_HOUR) }];
		const result = computeDowntimeMs(events, now - ONE_HOUR, now);
		assert.equal(result, 0);
	});
});

describe("uptimePercent", () => {
	const ONE_HOUR = 60 * 60 * 1000;
	const now = 1_000_000_000_000;
	const dtStr = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

	it("returns 100 for no downtime", () => {
		assert.equal(uptimePercent([], now - ONE_HOUR, now), 100);
	});

	it("returns 50 for half-hour down in one-hour window", () => {
		const events = [{ started_on: dtStr(now - 30 * 60 * 1000), ended_on: dtStr(now) }];
		assert.equal(uptimePercent(events, now - ONE_HOUR, now), 50);
	});

	it("returns 0 for full-window downtime", () => {
		const events = [{ started_on: dtStr(now - ONE_HOUR), ended_on: null }];
		assert.equal(uptimePercent(events, now - ONE_HOUR, now), 0);
	});

	it("clamps to 0 even if computed negative", () => {
		// Two overlapping events covering more than window — should still give 0
		const events = [
			{ started_on: dtStr(now - 2 * ONE_HOUR), ended_on: null },
			{ started_on: dtStr(now - 2 * ONE_HOUR), ended_on: null },
		];
		assert.equal(uptimePercent(events, now - ONE_HOUR, now), 0);
	});
});
