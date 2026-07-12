import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenizeTopLevel, check } from "../internal/nginx-lint.js";

describe("tokenizeTopLevel", () => {
	it("returns empty array for empty config", () => {
		assert.deepEqual(tokenizeTopLevel(""), []);
	});

	it("extracts a single directive", () => {
		const result = tokenizeTopLevel("client_max_body_size 10m;");
		assert.equal(result.length, 1);
		assert.equal(result[0].name, "client_max_body_size");
		assert.equal(result[0].line, 1);
	});

	it("extracts multiple top-level directives", () => {
		const cfg = "proxy_connect_timeout 30s;\nproxy_read_timeout 60s;\n";
		const result = tokenizeTopLevel(cfg);
		assert.equal(result.length, 2);
		assert.equal(result[0].name, "proxy_connect_timeout");
		assert.equal(result[1].name, "proxy_read_timeout");
	});

	it("skips content inside blocks", () => {
		const cfg = "location / {\n  proxy_buffering on;\n  client_max_body_size 0;\n}";
		const result = tokenizeTopLevel(cfg);
		assert.equal(result.length, 1);
		assert.equal(result[0].name, "location");
	});

	it("skips # comments", () => {
		const cfg = "# proxy_connect_timeout 30s;\nproxy_read_timeout 60s;\n";
		const result = tokenizeTopLevel(cfg);
		assert.equal(result.length, 1);
		assert.equal(result[0].name, "proxy_read_timeout");
	});

	it("reports correct line numbers", () => {
		const cfg = "foo bar;\n\nbaz qux;\n";
		const result = tokenizeTopLevel(cfg);
		assert.equal(result[0].line, 1);
		assert.equal(result[1].line, 3);
	});
});

describe("check", () => {
	it("does not throw when advanced_config is empty", () => {
		assert.doesNotThrow(() => check("", { client_max_body_size: "10m" }));
	});

	it("does not throw when guarded directive absent in config", () => {
		assert.doesNotThrow(() =>
			check("proxy_read_timeout 60s;", { client_max_body_size: "10m" }),
		);
	});

	it("does not throw when guarded directive present but structured field not set", () => {
		assert.doesNotThrow(() =>
			check("client_max_body_size 0;", { client_max_body_size: null }),
		);
	});

	it("throws ValidationError when guarded directive conflicts with set field", () => {
		assert.throws(
			() => check("client_max_body_size 0;", { client_max_body_size: "10m" }),
			(err) => {
				assert.ok(err.message.includes("client_max_body_size"));
				assert.ok(err.message.includes("line 1"));
				assert.equal(err.status, 400);
				return true;
			},
		);
	});

	it("includes line number in error for multi-line config", () => {
		const cfg = "proxy_connect_timeout 30s;\nclient_max_body_size 0;";
		assert.throws(
			() => check(cfg, { client_max_body_size: "10m" }),
			(err) => {
				assert.ok(err.message.includes("line 2"));
				return true;
			},
		);
	});

	it("does not throw for directive inside a block even if structured field set", () => {
		const cfg = "location / {\n  client_max_body_size 0;\n}";
		assert.doesNotThrow(() =>
			check(cfg, { client_max_body_size: "10m" }),
		);
	});
});
