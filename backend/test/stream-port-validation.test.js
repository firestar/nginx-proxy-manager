import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPortAvailable } from "../internal/stream-port-validation.js";

const baseStream = (overrides = {}) => ({
	id: 99,
	incoming_port: 8080,
	tcp_forwarding: true,
	udp_forwarding: false,
	node_id: null,
	node_all: false,
	enabled: true,
	is_deleted: false,
	...overrides,
});

describe("assertPortAvailable()", () => {
	it("accepts empty existing list", () => {
		assert.doesNotThrow(() =>
			assertPortAvailable({ incoming_port: 8080, tcp_forwarding: true }, []),
		);
	});

	it("rejects panel-reserved port 80 for local-scope stream", () => {
		assert.throws(
			() => assertPortAvailable({ incoming_port: 80, tcp_forwarding: true, node_id: null, node_all: false }, []),
			/Port 80 is reserved/,
		);
	});

	it("rejects panel-reserved port 81 for local-scope stream", () => {
		assert.throws(
			() => assertPortAvailable({ incoming_port: 81, tcp_forwarding: true, node_id: null, node_all: false }, []),
			/Port 81 is reserved/,
		);
	});

	it("rejects panel-reserved port 443 for local-scope stream", () => {
		assert.throws(
			() => assertPortAvailable({ incoming_port: 443, tcp_forwarding: true, node_id: null, node_all: false }, []),
			/Port 443 is reserved/,
		);
	});

	it("allows panel-reserved port 80 for node-scoped stream (node_id set)", () => {
		assert.doesNotThrow(() =>
			assertPortAvailable({ incoming_port: 80, tcp_forwarding: true, node_id: 5, node_all: false }, []),
		);
	});

	it("allows panel-reserved port 80 for node_all stream", () => {
		assert.doesNotThrow(() =>
			assertPortAvailable({ incoming_port: 80, tcp_forwarding: true, node_id: null, node_all: true }, []),
		);
	});

	it("rejects tcp/tcp conflict on same local scope", () => {
		const existing = [baseStream({ id: 1, incoming_port: 9000, tcp_forwarding: true })];
		assert.throws(
			() => assertPortAvailable({ incoming_port: 9000, tcp_forwarding: true, udp_forwarding: false, node_id: null, node_all: false }, existing),
			/already in use by stream id 1/,
		);
	});

	it("rejects udp/udp conflict on same local scope", () => {
		const existing = [baseStream({ id: 2, incoming_port: 9001, tcp_forwarding: false, udp_forwarding: true })];
		assert.throws(
			() => assertPortAvailable({ incoming_port: 9001, tcp_forwarding: false, udp_forwarding: true, node_id: null, node_all: false }, existing),
			/already in use by stream id 2/,
		);
	});

	it("allows tcp vs udp on same port (no protocol overlap)", () => {
		const existing = [baseStream({ id: 3, incoming_port: 9002, tcp_forwarding: true, udp_forwarding: false })];
		assert.doesNotThrow(() =>
			assertPortAvailable({ incoming_port: 9002, tcp_forwarding: false, udp_forwarding: true, node_id: null, node_all: false }, existing),
		);
	});

	it("ignores disabled stream", () => {
		const existing = [baseStream({ id: 4, incoming_port: 9003, enabled: false })];
		assert.doesNotThrow(() =>
			assertPortAvailable({ incoming_port: 9003, tcp_forwarding: true, node_id: null, node_all: false }, existing),
		);
	});

	it("ignores deleted stream", () => {
		const existing = [baseStream({ id: 5, incoming_port: 9004, is_deleted: true })];
		assert.doesNotThrow(() =>
			assertPortAvailable({ incoming_port: 9004, tcp_forwarding: true, node_id: null, node_all: false }, existing),
		);
	});

	it("excludes self on update (same id)", () => {
		const existing = [baseStream({ id: 10, incoming_port: 9005, tcp_forwarding: true })];
		assert.doesNotThrow(() =>
			assertPortAvailable({ id: 10, incoming_port: 9005, tcp_forwarding: true, node_id: null, node_all: false }, existing),
		);
	});

	it("rejects conflict when either side has node_all=true", () => {
		const existing = [baseStream({ id: 6, incoming_port: 9006, tcp_forwarding: true, node_all: true })];
		assert.throws(
			() => assertPortAvailable({ incoming_port: 9006, tcp_forwarding: true, node_id: 1, node_all: false }, existing),
			/already in use by stream id 6/,
		);
	});

	it("allows same port on different specific nodes", () => {
		const existing = [baseStream({ id: 7, incoming_port: 9007, tcp_forwarding: true, node_id: 1, node_all: false })];
		assert.doesNotThrow(() =>
			assertPortAvailable({ incoming_port: 9007, tcp_forwarding: true, node_id: 2, node_all: false }, existing),
		);
	});

	it("rejects conflict on same specific node_id", () => {
		const existing = [baseStream({ id: 8, incoming_port: 9008, tcp_forwarding: true, node_id: 3, node_all: false })];
		assert.throws(
			() => assertPortAvailable({ incoming_port: 9008, tcp_forwarding: true, node_id: 3, node_all: false }, existing),
			/already in use by stream id 8/,
		);
	});
});
