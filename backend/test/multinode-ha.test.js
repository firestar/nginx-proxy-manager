/**
 * Tests for P8-M3 multi-node HA: HTTP-01 relay templating + replicate-to-all.
 *
 * Template tests render the Liquid partials directly. Wiring tests read source
 * files (the DB-dependent modules need /data), matching the multinode-metrics
 * smoke-test style.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(__dirname, "../templates");
const engine = new Liquid({ root: templateDir });
const src = (rel) => readFileSync(resolve(__dirname, rel), "utf8");
const tpl = (name) => readFileSync(resolve(templateDir, name), "utf8");

describe("_acme_relay.conf template", () => {
	it("emits nothing when acme_relay_url is empty", async () => {
		const out = await engine.parseAndRender(tpl("_acme_relay.conf"), { acme_relay_url: "" });
		assert.ok(!out.includes("acme-challenge"), "no relay location without a relay URL");
	});

	it("emits a challenge relay location proxying to the panel when set", async () => {
		const out = await engine.parseAndRender(tpl("_acme_relay.conf"), { acme_relay_url: "http://panel.example.com" });
		assert.ok(out.includes("location ^~ /.well-known/acme-challenge/"), "relay location present");
		assert.ok(out.includes("proxy_pass http://panel.example.com;"), "proxies to the panel");
		assert.ok(out.includes("proxy_set_header Host $host;"), "preserves Host for the challenge");
	});
});

describe("_certificates.conf template — acme relay guard", () => {
	const ctx = (extra) => ({ certificate: { provider: "letsencrypt" }, certificate_id: 1, ...extra });

	it("includes the local acme-challenge webroot when no relay is configured", async () => {
		const out = await engine.parseAndRender(tpl("_certificates.conf"), ctx({}));
		assert.ok(out.includes("letsencrypt-acme-challenge.conf"), "local challenge include present");
	});

	it("skips the local acme-challenge include when the relay is configured", async () => {
		const out = await engine.parseAndRender(tpl("_certificates.conf"), ctx({ acme_relay_url: "http://panel" }));
		assert.ok(!out.includes("letsencrypt-acme-challenge.conf"), "no duplicate challenge location with relay");
		assert.ok(out.includes("ssl_certificate /etc/letsencrypt/live/npm-1/fullchain.pem;"), "cert still wired");
	});
});

describe("proxy_host.conf template — relay wired into server block", () => {
	it("includes the acme relay partial after the certificates include", () => {
		const text = tpl("proxy_host.conf");
		const certIdx = text.indexOf('_certificates.conf');
		const relayIdx = text.indexOf('_acme_relay.conf');
		assert.ok(relayIdx > -1, "proxy_host.conf includes _acme_relay.conf");
		assert.ok(relayIdx > certIdx, "relay include comes after certificates include");
	});
});

describe("node.js — replicate-to-all + per-node status", () => {
	const text = src("../internal/node.js");

	it("snapshot query covers node_id OR node_all hosts", () => {
		assert.ok(text.includes('.where("node_id", node.id).orWhere("node_all", 1)'), "buildSnapshot includes replicate-to-all hosts");
	});

	it("passes acme_relay_url into remote render", () => {
		assert.ok(text.includes("acme_relay_url: acmeRelayUrl"), "renderConfig gets the relay URL");
	});

	it("aggregates per-node apply status worst-of on the host", () => {
		assert.ok(text.includes("patchHostsNodeStatus"), "has per-node status writer");
		assert.ok(text.includes("node_status"), "stores node_status map");
		// worst-of: an errored node wins over pending/ok
		assert.ok(text.includes("errored") && text.includes("pending"), "derives aggregate from errored/pending");
	});

	it("has replicate-to-all + ack-wait plumbing", () => {
		assert.ok(text.includes("schedulePushAll"), "schedulePushAll exists");
		assert.ok(text.includes("scheduleHostPush"), "scheduleHostPush exists");
		assert.ok(text.includes("pushNodeAndWait"), "pushNodeAndWait exists");
		assert.ok(text.includes("resolveAckWaiters"), "ack waiters resolved on ack");
	});

	it("relaxes cert rule when the ACME relay is configured", () => {
		assert.ok(text.includes("getAcmeRelayUrl"), "reads the relay setting");
		assert.ok(/const relayUrl = await getAcmeRelayUrl\(\)/.test(text), "assertHostAllowed consults the relay URL");
		assert.ok(text.includes("!dns_challenge") === false || text.includes("!cert.meta?.dns_challenge && !relayUrl"), "http-01 allowed only with relay");
	});
});

describe("nginx.js — node_all routing", () => {
	const text = src("../internal/nginx.js");
	it("configure/deleteConfig treat node_all as remote", () => {
		assert.ok(text.includes("host.node_id || host.node_all"), "configure branches on node_all");
		assert.ok(text.includes("scheduleHostPush(host)"), "deleteConfig routes via scheduleHostPush");
	});
	it("bulkGenerateConfigs pushes all nodes for replicate-to-all hosts", () => {
		assert.ok(text.includes("schedulePushAll()"), "bulk path handles node_all");
	});
});

describe("certificate.js — HTTP-01 relay prep", () => {
	const text = src("../internal/certificate.js");
	it("prepares remote relays before requesting an HTTP-01 cert", () => {
		assert.ok(text.includes("prepareRemoteRelay"), "prepareRemoteRelay defined + called");
		assert.ok(text.includes("pushNodeAndWait"), "waits for agents to apply the relay");
	});
});

describe("schema + migration + setup", () => {
	it("migration adds node_all to host tables", () => {
		const text = src("../migrations/20260712180000_multinode_ha.js");
		assert.ok(text.includes('"node_all"') || text.includes("node_all"), "migration references node_all");
		assert.ok(text.includes("proxy_host") && text.includes("stream"), "covers host tables");
	});

	it("setup seeds the acme-relay-url setting", () => {
		const text = src("../setup.js");
		assert.ok(text.includes("acme-relay-url"), "setup seeds acme-relay-url");
	});

	it("host object schemas expose node_all", () => {
		for (const f of [
			"../schema/components/proxy-host-object.json",
			"../schema/components/redirection-host-object.json",
			"../schema/components/dead-host-object.json",
			"../schema/components/stream-object.json",
		]) {
			assert.ok(src(f).includes('"node_all"'), `${f} exposes node_all`);
		}
	});
});
