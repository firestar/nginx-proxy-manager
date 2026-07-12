import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Cache-busting import so NODE_PATH / env changes take effect
let counter = 0;
const load = async () => {
	counter++;
	return await import(`../../agent/metrics.js?i=${counter}`);
};

const LINE1 = '[11/Jul/2026:14:30:45 +0000] MISS 200 200 - GET https h.example.com "/a" [Client 1.2.3.4] [Length 512] [Gzip -] [Sent-to 10.0.0.1] "curl" "-"';
const LINE2 = '[11/Jul/2026:14:30:58 +0000] HIT 200 200 - GET https h.example.com "/b" [Client 1.2.3.4] [Length 128] [Gzip -] [Sent-to 10.0.0.1] "curl" "-"';
const LINE3_NEXT_MIN = '[11/Jul/2026:14:31:10 +0000] MISS 404 404 - GET https h.example.com "/c" [Client 1.2.3.4] [Length 0] [Gzip -] [Sent-to 10.0.0.1] "curl" "-"';

describe("agent processLog", () => {
	let tmp;
	before(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "npm-agent-metrics-test-"));
	});
	after(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("returns empty array when log file does not exist", async () => {
		const { processLog } = await load();
		const stateMap = new Map();
		const result = processLog(99, path.join(tmp, "nonexistent.log"), stateMap);
		assert.deepEqual(result, []);
	});

	it("aggregates two lines in the same minute bucket", async () => {
		const { processLog } = await load();
		const logPath = path.join(tmp, "proxy-host-1_access.log");
		fs.writeFileSync(logPath, `${LINE1}\n${LINE2}\n`, "utf8");

		const stateMap = new Map();
		const result = processLog(1, logPath, stateMap);

		assert.equal(result.length, 1, "one minute bucket");
		const b = result[0];
		assert.equal(b.proxyHostId, 1);
		assert.equal(b.bucket, "2026-07-11 14:30:00");
		assert.equal(b.resolution, "minute");
		assert.equal(b.requests, 2);
		assert.equal(b.status_2xx, 2);
		assert.equal(b.cache_hits, 1);
		assert.equal(b.bytes_sent, 640);
	});

	it("produces two buckets for lines in different minutes", async () => {
		const { processLog } = await load();
		const logPath = path.join(tmp, "proxy-host-2_access.log");
		fs.writeFileSync(logPath, `${LINE1}\n${LINE3_NEXT_MIN}\n`, "utf8");

		const stateMap = new Map();
		const result = processLog(2, logPath, stateMap);

		assert.equal(result.length, 2, "two minute buckets");
		const buckets = result.sort((a, b) => a.bucket.localeCompare(b.bucket));
		assert.equal(buckets[0].bucket, "2026-07-11 14:30:00");
		assert.equal(buckets[0].status_4xx, 0);
		assert.equal(buckets[1].bucket, "2026-07-11 14:31:00");
		assert.equal(buckets[1].status_4xx, 1);
	});

	it("advances state offset after processing", async () => {
		const { processLog } = await load();
		const logPath = path.join(tmp, "proxy-host-3_access.log");
		const content = `${LINE1}\n`;
		fs.writeFileSync(logPath, content, "utf8");

		const stateMap = new Map();
		processLog(3, logPath, stateMap);

		const state = stateMap.get(3);
		assert.ok(state, "state entry created");
		assert.ok(Number(state.file_offset) > 0, "offset advanced");
		assert.equal(Number(state.file_size), Buffer.byteLength(content, "utf8"));
	});

	it("reads only new bytes after offset is set (incremental read)", async () => {
		const { processLog } = await load();
		const logPath = path.join(tmp, "proxy-host-4_access.log");
		const first = `${LINE1}\n`;
		fs.writeFileSync(logPath, first, "utf8");

		const stateMap = new Map();
		// First pass
		const r1 = processLog(4, logPath, stateMap);
		assert.equal(r1.length, 1);

		// Append a second line
		fs.appendFileSync(logPath, `${LINE3_NEXT_MIN}\n`, "utf8");
		// Second pass — should only read the new line
		const r2 = processLog(4, logPath, stateMap);
		assert.equal(r2.length, 1);
		assert.equal(r2[0].bucket, "2026-07-11 14:31:00");
	});

	it("resets offset when file is truncated (log rotation)", async () => {
		const { processLog } = await load();
		const logPath = path.join(tmp, "proxy-host-5_access.log");
		fs.writeFileSync(logPath, `${LINE1}\n`, "utf8");

		const stateMap = new Map();
		processLog(5, logPath, stateMap);

		// Simulate rotation: truncate and write a new line
		fs.writeFileSync(logPath, `${LINE3_NEXT_MIN}\n`, "utf8");
		const r2 = processLog(5, logPath, stateMap);
		assert.equal(r2.length, 1);
		assert.equal(r2[0].bucket, "2026-07-11 14:31:00");
	});

	it("returns empty array when no new bytes since last read", async () => {
		const { processLog } = await load();
		const logPath = path.join(tmp, "proxy-host-6_access.log");
		fs.writeFileSync(logPath, `${LINE1}\n`, "utf8");

		const stateMap = new Map();
		processLog(6, logPath, stateMap); // first pass
		const r2 = processLog(6, logPath, stateMap); // second pass — no new content
		assert.deepEqual(r2, []);
	});
});
