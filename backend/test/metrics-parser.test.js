import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLogLine } from "../internal/metrics-parser.js";

const validLine =
	'[11/Jul/2026:14:30:45 +0000] MISS 200 200 - GET https example.com "/path?q=1" [Client 1.2.3.4] [Length 512] [Gzip -] [Sent-to 10.0.0.1] "Mozilla/5.0" "-"';

const hitLine =
	'[11/Jul/2026:14:30:45 +0000] HIT 200 200 - GET https example.com "/path" [Client 1.2.3.4] [Length 1024] [Gzip -] [Sent-to 10.0.0.1] "curl/7.0" "-"';

const status4xxLine =
	'[11/Jul/2026:15:00:00 +0000] MISS 404 404 - GET https example.com "/missing" [Client 9.9.9.9] [Length 0] [Gzip -] [Sent-to 10.0.0.1] "bot" "-"';

const status5xxLine =
	'[11/Jul/2026:16:00:00 +0000] MISS 502 502 - GET https example.com "/err" [Client 9.9.9.9] [Length 0] [Gzip 1.2] [Sent-to 10.0.0.1] "agent" "-"';

const partialLine = "[11/Jul/2026:14:30:45 +0000] MISS";
const emptyLine = "";

describe("parseLogLine", () => {
	it("returns null for empty line", () => {
		assert.equal(parseLogLine(emptyLine), null);
	});

	it("returns null for partial / unparseable line", () => {
		assert.equal(parseLogLine(partialLine), null);
	});

	it("parses a valid MISS line", () => {
		const result = parseLogLine(validLine);
		assert.notEqual(result, null);
		assert.equal(result.bucket, "2026-07-11 14:30:00");
		assert.equal(result.status, 200);
		assert.equal(result.bytes, 512);
		assert.equal(result.cacheHit, false);
	});

	it("detects cache HIT", () => {
		const result = parseLogLine(hitLine);
		assert.notEqual(result, null);
		assert.equal(result.cacheHit, true);
		assert.equal(result.bytes, 1024);
	});

	it("parses 4xx status", () => {
		const result = parseLogLine(status4xxLine);
		assert.notEqual(result, null);
		assert.equal(result.status, 404);
	});

	it("parses 5xx status", () => {
		const result = parseLogLine(status5xxLine);
		assert.notEqual(result, null);
		assert.equal(result.status, 502);
	});

	it("bucket is minute-truncated (seconds zeroed)", () => {
		const result = parseLogLine(validLine);
		assert.notEqual(result, null);
		assert.match(result.bucket, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/);
	});

	it("handles URI with escaped quotes in request_uri", () => {
		const lineWithQuotes =
			'[11/Jul/2026:14:30:45 +0000] MISS 200 200 - GET https example.com "/path?q=\\"val\\"" [Client 1.2.3.4] [Length 128] [Gzip -] [Sent-to 10.0.0.1] "agent" "-"';
		const result = parseLogLine(lineWithQuotes);
		assert.notEqual(result, null);
		assert.equal(result.status, 200);
	});

	it("converts non-UTC time_local offset to UTC bucket", () => {
		const line =
			'[11/Jul/2026:16:30:45 +0200] MISS 200 200 - GET https example.com "/p" [Client 1.2.3.4] [Length 10] [Gzip -] [Sent-to 10.0.0.1] "agent" "-"';
		const result = parseLogLine(line);
		assert.notEqual(result, null);
		assert.equal(result.bucket, "2026-07-11 14:30:00");
	});

	it("parses comma-joined multi-upstream status", () => {
		const line =
			'[11/Jul/2026:14:30:45 +0000] MISS 502, 200 200 - GET https example.com "/retry" [Client 1.2.3.4] [Length 64] [Gzip -] [Sent-to 10.0.0.1] "agent" "-"';
		const result = parseLogLine(line);
		assert.notEqual(result, null);
		assert.equal(result.status, 200);
	});

	it("parses empty Gzip and Sent-to fields", () => {
		const line =
			'[11/Jul/2026:14:30:45 +0000] HIT - 200 - GET https example.com "/cached" [Client 1.2.3.4] [Length 32] [Gzip ] [Sent-to ] "agent" "-"';
		const result = parseLogLine(line);
		assert.notEqual(result, null);
		assert.equal(result.cacheHit, true);
	});
});
