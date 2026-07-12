import db from "../db.js";
import events, { UPSTREAM_DOWN, UPSTREAM_UP } from "../lib/events.js";
import { uptime as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import { parseExpectedStatus, computeDowntimeMs, uptimePercent, toMs } from "./uptime-helpers.js";

const TICK_INTERVAL = 10 * 1000; // 10s — check all due hosts each tick
const PROBE_TIMEOUT_MS = 10 * 1000;
const FLAP_THRESHOLD = 2; // consecutive hits required to flip state

// Per-host consecutive counter: { up: number, down: number }
const counters = new Map();

const nowStr = () => new Date().toISOString().replace("T", " ").slice(0, 19);

// ---- Probe ----
const probe = async (host) => {
	const url = `${host.forward_scheme}://${host.forward_host}:${host.forward_port}${host.check_path || "/"}`;
	const firstDomain = Array.isArray(host.domain_names) ? host.domain_names[0] : host.forward_host;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	const t0 = Date.now();
	try {
		const fetchOpts = {
			method: "HEAD",
			headers: { Host: firstDomain },
			signal: controller.signal,
			redirect: "follow",
		};
		if (host.forward_scheme === "https") {
			fetchOpts.dispatcher = new (await import("undici").then((m) => m.Agent))({
				connect: { rejectUnauthorized: false },
			});
		}
		const res = await fetch(url, fetchOpts);
		const latencyMs = Date.now() - t0;
		const ok = parseExpectedStatus(host.expected_status || "200-399")(res.status);
		return { ok, status: res.status, latencyMs, error: null };
	} catch (err) {
		const latencyMs = Date.now() - t0;
		return { ok: false, status: null, latencyMs, error: err.message };
	} finally {
		clearTimeout(timer);
	}
};

// ---- State transition ----

const upsertStatus = async (knex, hostId, nodeId, status, latencyMs, lastError) => {
	const row = await knex("upstream_status").where("proxy_host_id", hostId).first();
	const now = nowStr();
	if (row) {
		await knex("upstream_status").where("proxy_host_id", hostId).update({
			status,
			latency_ms: latencyMs,
			last_error: lastError,
			last_checked: now,
		});
	} else {
		await knex("upstream_status").insert({
			proxy_host_id: hostId,
			status,
			latency_ms: latencyMs,
			last_error: lastError,
			since: now,
			last_checked: now,
			node_id: nodeId,
		});
	}
};

const transition = async (knex, host, nodeId, newStatus) => {
	const now = nowStr();
	const domains = Array.isArray(host.domain_names) ? host.domain_names : [];

	// Close any open event for previous status
	await knex("uptime_event").where("proxy_host_id", host.id).whereNull("ended_on").update({ ended_on: now });

	// Insert new event
	await knex("uptime_event").insert({
		proxy_host_id: host.id,
		status: newStatus,
		started_on: now,
		ended_on: null,
		node_id: nodeId,
	});

	// Update since on status row
	await knex("upstream_status").where("proxy_host_id", host.id).update({ status: newStatus, since: now });

	if (newStatus === "down") {
		events.emit(UPSTREAM_DOWN, { id: host.id, domains, error: "Upstream not responding" });
	} else {
		events.emit(UPSTREAM_UP, { id: host.id, domains, error: null });
	}
	logger.info(`Host ${host.id} (${domains.join(", ")}) is now ${newStatus.toUpperCase()}`);
};

const applyProbeResult = async (knex, host, result, nodeId) => {

	let c = counters.get(host.id);
	if (!c) {
		c = { up: 0, down: 0 };
		counters.set(host.id, c);
	}

	if (result.ok) {
		c.up += 1;
		c.down = 0;
	} else {
		c.down += 1;
		c.up = 0;
	}

	const row = await knex("upstream_status").where("proxy_host_id", host.id).first();
	const currentStatus = row ? row.status : "up";

	let newStatus = currentStatus;

	// Transition on threshold
	if (currentStatus !== "down" && c.down >= FLAP_THRESHOLD) {
		newStatus = "down";
		await transition(knex, host, nodeId, "down");
	} else if (currentStatus !== "up" && c.up >= FLAP_THRESHOLD) {
		newStatus = "up";
		await transition(knex, host, nodeId, "up");
	}

	await upsertStatus(knex, host.id, nodeId, newStatus, result.latencyMs, result.error);
};

// ---- Timer ----


/**
 * Process a probe result from a remote agent for a host pinned to that node.
 *
 * @param {number} nodeId
 * @param {number} hostId
 * @param {{ok, status, latencyMs, error}} result
 */
const recordRemoteProbe = async (nodeId, hostId, result) => {
	const knex = db();
	const host = await knex("proxy_host")
		.where({ id: hostId, node_id: nodeId, is_deleted: 0, enabled: 1, check_enabled: 1 })
		.first();
	if (!host) return;
	if (typeof host.domain_names === "string") {
		try { host.domain_names = JSON.parse(host.domain_names); } catch { host.domain_names = []; }
	}
	await applyProbeResult(knex, host, result, nodeId);
};

const internalUptime = {
	interval: null,
	interval_processing: false,

	initTimer: () => {
		logger.info("Uptime checker timer initialized");
		internalUptime.check();
		internalUptime.interval = setInterval(internalUptime.check, TICK_INTERVAL);
	},

	check: () => {
		if (internalUptime.interval_processing) return;
		internalUptime.interval_processing = true;

		const knex = db();
		ProxyHost.query()
			.where({ is_deleted: 0, enabled: 1, check_enabled: 1 })
			.whereNull("node_id")
			.then(async (hosts) => {
				const now = Date.now();
				for (const host of hosts) {
					try {
						const row = await knex("upstream_status").where("proxy_host_id", host.id).first();
						const lastChecked = row && row.last_checked ? toMs(row.last_checked) : 0;
						const intervalMs = (host.check_interval_s || 60) * 1000;
						if (now - lastChecked < intervalMs) continue;
						const result = await probe(host);
						await applyProbeResult(knex, host, result, null);
					} catch (err) {
						logger.error(`Error checking host ${host.id}: ${err.message}`);
					}
				}
			})
			.catch((err) => {
				logger.error(`Uptime check error: ${err.message}`);
			})
			.finally(() => {
				internalUptime.interval_processing = false;
			});
	},
};

export default internalUptime;
export { parseExpectedStatus, computeDowntimeMs, uptimePercent, recordRemoteProbe };
