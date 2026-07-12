import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../internal/proxy-header.js";

describe("proxy-header validate()", () => {
	it("accepts null", () => {
		assert.doesNotThrow(() => validate(null));
	});

	it("accepts undefined", () => {
		assert.doesNotThrow(() => validate(undefined));
	});

	it("accepts empty array", () => {
		assert.doesNotThrow(() => validate([]));
	});

	it("accepts valid request/set header", () => {
		assert.doesNotThrow(() =>
			validate([{ direction: "request", action: "set", name: "X-Custom", value: "hello" }]),
		);
	});

	it("accepts valid request/remove header", () => {
		assert.doesNotThrow(() =>
			validate([{ direction: "request", action: "remove", name: "X-Custom", value: "" }]),
		);
	});

	it("accepts valid response/set header", () => {
		assert.doesNotThrow(() =>
			validate([{ direction: "response", action: "set", name: "Cache-Control", value: "no-cache" }]),
		);
	});

	it("accepts valid response/remove header", () => {
		assert.doesNotThrow(() =>
			validate([{ direction: "response", action: "remove", name: "X-Powered-By", value: "" }]),
		);
	});

	it("rejects non-array", () => {
		assert.throws(() => validate("invalid"), /must be an array/);
	});

	it("rejects invalid direction", () => {
		assert.throws(
			() => validate([{ direction: "both", action: "set", name: "X-A", value: "v" }]),
			/direction must be/,
		);
	});

	it("rejects invalid action", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "append", name: "X-A", value: "v" }]),
			/action must be/,
		);
	});

	it("rejects name with invalid chars", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "X_Custom", value: "v" }]),
			/name must match/,
		);
	});

	it("rejects empty name", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "", value: "v" }]),
			/name must match/,
		);
	});

	it("rejects blocked name Host (case-insensitive)", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "Host", value: "example.com" }]),
			/managed by NPM/,
		);
	});

	it("rejects blocked name X-Forwarded-For", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "X-Forwarded-For", value: "1.2.3.4" }]),
			/managed by NPM/,
		);
	});

	it("rejects blocked name X-Forwarded-Proto", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "X-Forwarded-Proto", value: "https" }]),
			/managed by NPM/,
		);
	});

	it("rejects set with empty value", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "X-A", value: "" }]),
			/value is required/,
		);
	});

	it("rejects value with double-quote", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "X-A", value: 'say "hello"' }]),
			/double-quotes/,
		);
	});

	it("rejects value with newline", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "X-A", value: "line1\nline2" }]),
			/newlines/,
		);
	});

	it("rejects value ending with semicolon", () => {
		assert.throws(
			() => validate([{ direction: "request", action: "set", name: "X-A", value: "value;" }]),
			/semicolon/,
		);
	});

	it("allows semicolon inside value (not trailing)", () => {
		assert.doesNotThrow(() =>
			validate([{ direction: "response", action: "set", name: "Cache-Control", value: "max-age=3600; must-revalidate" }]),
		);
	});

	it("allows HSTS-style value with semicolons not trailing", () => {
		assert.doesNotThrow(() =>
			validate([
				{
					direction: "response",
					action: "set",
					name: "Strict-Transport-Security",
					value: "max-age=31536000; includeSubDomains",
				},
			]),
		);
	});
});
