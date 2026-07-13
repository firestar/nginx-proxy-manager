import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Liquid } from "liquidjs";
import proxyUpstream from "../internal/proxy-upstream.js";

const templateDir = path.resolve(import.meta.dirname, "../templates");
const engine = new Liquid({ root: templateDir });

const template = fs.readFileSync(path.join(templateDir, "proxy_host.conf"), "utf8");
// Byte-for-byte snapshot of proxy_host.conf as it was before load balancing was added.
const originalTemplate = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "proxy_host.conf.orig"), "utf8");

// Minimal host row sufficient to render the default-location branch.
const baseHost = {
	id: 1,
	enabled: true,
	forward_scheme: "http",
	forward_host: "example.com",
	forward_port: 8080,
	use_default_location: true,
	allow_websocket_upgrade: false,
	maintenance_mode: false,
	advanced_config: "",
	locations: "",
	ipv6: false,
};

const render = (tpl, host) => engine.parseAndRender(tpl, host);

describe("proxy_host.conf template — load balancing", () => {
	it("non-LB render is byte-identical to the pre-LB template (regression guard)", async () => {
		const host = { ...baseHost, upstreams: null, balance_method: null };
		const before = await render(originalTemplate, host);
		const after = await render(template, host);
		assert.equal(after, before);
	});

	it("non-LB keeps the proxy.conf include and emits no upstream block", async () => {
		const out = await render(template, { ...baseHost, upstreams: null });
		assert.ok(out.includes("include conf.d/include/proxy.conf;"));
		assert.ok(!/upstream npm_\d+ \{/.test(out));
		assert.ok(!out.includes("proxy_pass http://npm_"));
	});

	it("LB emits an upstream block and a static proxy_pass, and drops the proxy.conf include", async () => {
		const out = await render(template, {
			...baseHost,
			upstreams: [
				{ host: "10.0.0.2", port: 8080 },
				{ host: "10.0.0.3", port: 8080 },
			],
		});
		assert.ok(out.includes("upstream npm_1 {"), "upstream block present");
		assert.ok(out.includes("server 10.0.0.2:8080;"));
		assert.ok(out.includes("server 10.0.0.3:8080;"));
		assert.ok(out.includes("proxy_pass       http://npm_1;"), "static proxy_pass to the group");
		assert.ok(!out.includes("include conf.d/include/proxy.conf;"), "must not include proxy.conf in LB mode");
	});

	it("balance_method least_conn is emitted inside the upstream block", async () => {
		const out = await render(template, {
			...baseHost,
			balance_method: "least_conn",
			upstreams: [{ host: "10.0.0.2", port: 8080 }],
		});
		assert.match(out, /upstream npm_1 \{\n\s*least_conn;/);
	});

	it("balance_method ip_hash is emitted inside the upstream block", async () => {
		const out = await render(template, {
			...baseHost,
			balance_method: "ip_hash",
			upstreams: [{ host: "10.0.0.2", port: 8080 }],
		});
		assert.match(out, /upstream npm_1 \{\n\s*ip_hash;/);
	});

	it("no balance_method => no method directive (round robin)", async () => {
		const out = await render(template, {
			...baseHost,
			balance_method: null,
			upstreams: [{ host: "10.0.0.2", port: 8080 }],
		});
		assert.ok(!out.includes("least_conn;"));
		assert.ok(!out.includes("ip_hash;"));
	});

	it("weight, max_fails, fail_timeout and backup permutations render on the server line", async () => {
		const out = await render(template, {
			...baseHost,
			upstreams: [
				{ host: "10.0.0.2", port: 8080, weight: 3, max_fails: 2, fail_timeout: 15 },
				{ host: "10.0.0.3", port: 9090, backup: true },
			],
		});
		assert.ok(out.includes("server 10.0.0.2:8080 weight=3 max_fails=2 fail_timeout=15s;"));
		assert.ok(out.includes("server 10.0.0.3:9090 backup;"));
	});

	it("max_fails=0 is emitted explicitly (0 is a valid nginx value)", async () => {
		const out = await render(template, {
			...baseHost,
			upstreams: [{ host: "10.0.0.2", port: 8080, max_fails: 0 }],
		});
		assert.ok(out.includes("server 10.0.0.2:8080 max_fails=0;"));
	});

	it("LB branch still applies the websocket upgrade block and headers include", async () => {
		const out = await render(template, {
			...baseHost,
			allow_websocket_upgrade: true,
			upstreams: [{ host: "10.0.0.2", port: 8080 }],
		});
		// websocket directives inside the location block
		assert.ok(out.includes("proxy_set_header Upgrade $http_upgrade;"));
		assert.ok(out.includes("proxy_pass       http://npm_1;"));
	});
});

describe("proxy-upstream validation", () => {
	it("accepts null (single-target mode)", () => {
		assert.doesNotThrow(() => proxyUpstream.validate(null, null));
		assert.doesNotThrow(() => proxyUpstream.validate(undefined, undefined));
	});

	it("accepts a valid pool", () => {
		assert.doesNotThrow(() =>
			proxyUpstream.validate(
				[
					{ host: "10.0.0.2", port: 8080, weight: 2 },
					{ host: "10.0.0.3", port: 8080, backup: true },
				],
				"least_conn",
			),
		);
	});

	it("rejects an empty array", () => {
		assert.throws(() => proxyUpstream.validate([], null), /at least one entry/);
	});

	it("rejects a pool with only backup entries", () => {
		assert.throws(
			() => proxyUpstream.validate([{ host: "10.0.0.2", port: 8080, backup: true }], null),
			/at least one non-backup/,
		);
	});

	it("rejects duplicate host:port pairs", () => {
		assert.throws(
			() =>
				proxyUpstream.validate(
					[
						{ host: "10.0.0.2", port: 8080 },
						{ host: "10.0.0.2", port: 8080 },
					],
					null,
				),
			/duplicate host:port/,
		);
	});

	it("rejects weight < 1", () => {
		assert.throws(() => proxyUpstream.validate([{ host: "10.0.0.2", port: 8080, weight: 0 }], null), /weight/);
	});

	it("rejects an invalid balance_method", () => {
		assert.throws(
			() => proxyUpstream.validate([{ host: "10.0.0.2", port: 8080 }], "random"),
			/balance_method/,
		);
	});

	it("rejects a bad port", () => {
		assert.throws(() => proxyUpstream.validate([{ host: "10.0.0.2", port: 0 }], null), /port/);
	});
});
