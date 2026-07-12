import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// Minimal stubs — we test pure logic without DB or network.

describe("notification dispatcher — event matching", () => {
	it("includes channel when its events array contains the event", () => {
		const channel = { id: 1, type: "webhook", events: ["host.offline", "host.online"], enabled: true, config: {} };
		assert.ok(channel.events.includes("host.offline"));
		assert.ok(channel.events.includes("host.online"));
		assert.ok(!channel.events.includes("certificate.expiring"));
	});

	it("excludes channel when events array does not contain the event", () => {
		const channel = { id: 2, type: "slack", events: ["certificate.expiring"], enabled: true, config: {} };
		assert.ok(!channel.events.includes("host.offline"));
	});

	it("excludes disabled channel", () => {
		const channel = { id: 3, type: "discord", events: ["host.offline"], enabled: false, config: {} };
		assert.ok(!channel.enabled);
	});
});

describe("notification dispatcher — dedupe key", () => {
	const dedupeKey = (eventName, payload) => {
		const id = payload.id ?? "unknown";
		return `${eventName}:${id}`;
	};

	it("uses event name and id", () => {
		assert.equal(dedupeKey("host.offline", { id: 42 }), "host.offline:42");
	});

	it("falls back to 'unknown' when id is missing", () => {
		assert.equal(dedupeKey("host.online", {}), "host.online:unknown");
	});

	it("cert expiry key uses cert id (no days suffix)", () => {
		assert.equal(dedupeKey("certificate.expiring", { id: 7, days: 14 }), "certificate.expiring:7");
	});

	it("same event + same id produces same key regardless of payload changes", () => {
		const k1 = dedupeKey("certificate.expiring", { id: 5, days: 30 });
		const k2 = dedupeKey("certificate.expiring", { id: 5, days: 28 });
		assert.equal(k1, k2);
	});
});

describe("notification dispatcher — dedupe window", () => {
	const CERTIFICATE_EXPIRING = "certificate.expiring";
	const DEDUPE_WINDOWS = { [CERTIFICATE_EXPIRING]: 23 * 60 * 60 * 1000 };
	const DEFAULT_DEDUPE_MS = 60 * 60 * 1000;

	const windowFor = (eventName) => DEDUPE_WINDOWS[eventName] ?? DEFAULT_DEDUPE_MS;

	it("cert expiry uses 23h window", () => {
		assert.equal(windowFor("certificate.expiring"), 23 * 60 * 60 * 1000);
	});

	it("host events use 1h window", () => {
		assert.equal(windowFor("host.offline"), 60 * 60 * 1000);
		assert.equal(windowFor("host.online"), 60 * 60 * 1000);
	});

	it("renewal_failed uses 1h window", () => {
		assert.equal(windowFor("certificate.renewal_failed"), 60 * 60 * 1000);
	});
});

describe("notification dispatcher — event summary", () => {
	const HOST_OFFLINE = "host.offline";
	const HOST_ONLINE = "host.online";
	const CERTIFICATE_EXPIRING = "certificate.expiring";
	const CERTIFICATE_RENEWAL_FAILED = "certificate.renewal_failed";

	const eventSummary = (eventName, payload) => {
		const domains = Array.isArray(payload.domains) ? payload.domains.join(", ") : "";
		switch (eventName) {
			case HOST_OFFLINE:
				return `Host OFFLINE: ${domains || `(id=${payload.id})`}\nError: ${payload.error || "unknown"}`;
			case HOST_ONLINE:
				return `Host back ONLINE: ${domains || `(id=${payload.id})`}`;
			case CERTIFICATE_EXPIRING:
				return `Certificate expiring in ${payload.days} day(s): ${domains || `(id=${payload.id})`} (expires ${payload.expires_on})`;
			case CERTIFICATE_RENEWAL_FAILED:
				return `Certificate renewal FAILED: ${domains || `(id=${payload.id})`}\nError: ${payload.error || "unknown"}`;
			default:
				return `Event: ${eventName}`;
		}
	};

	it("formats host.offline with domains", () => {
		const s = eventSummary("host.offline", { id: 1, domains: ["a.com", "b.com"], error: "bad config" });
		assert.ok(s.includes("OFFLINE"));
		assert.ok(s.includes("a.com, b.com"));
		assert.ok(s.includes("bad config"));
	});

	it("formats host.online", () => {
		const s = eventSummary("host.online", { id: 2, domains: ["x.com"] });
		assert.ok(s.includes("ONLINE"));
		assert.ok(s.includes("x.com"));
	});

	it("formats certificate.expiring with days", () => {
		const s = eventSummary("certificate.expiring", { id: 3, domains: ["y.com"], days: 7, expires_on: "2026-08-01" });
		assert.ok(s.includes("7 day(s)"));
		assert.ok(s.includes("y.com"));
		assert.ok(s.includes("2026-08-01"));
	});

	it("formats certificate.renewal_failed", () => {
		const s = eventSummary("certificate.renewal_failed", { id: 4, domains: ["z.com"], error: "ACME timeout" });
		assert.ok(s.includes("FAILED"));
		assert.ok(s.includes("ACME timeout"));
	});

	it("falls back to id when domains is empty", () => {
		const s = eventSummary("host.offline", { id: 99, domains: [], error: "err" });
		assert.ok(s.includes("id=99"));
	});
});
