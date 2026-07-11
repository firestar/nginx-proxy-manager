import fs from "node:fs";
import db from "../db.js";
import { metrics as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import { parseLogLine } from "./metrics-parser.js";

const LOG_DIR = "/data/logs";
const COLLECT_INTERVAL = 30 * 1000; // 30s
// Cap bytes read per pass so a huge unread backlog (e.g. after downtime) can't
// exhaust memory; the offset only advances to the last parsed newline, so the
// remainder is picked up on subsequent passes.
const MAX_READ_BYTES = 16 * 1024 * 1024;
const MINUTE_RETENTION_HOURS = 48;
const HOUR_RETENTION_DAYS = 30;

/**
 * Return minute-truncated bucket string for a datetime string.
 *
 * @param   {string} dt  "YYYY-MM-DD HH:MM:SS"
 * @returns {string}
 */
const minuteBucket = (dt) => `${dt.slice(0, 16)}:00`;

/**
 * Return hour-truncated bucket string for a datetime string.
 *
 * @param   {string} dt  "YYYY-MM-DD HH:MM:SS"
 * @returns {string}
 */
const hourBucket = (dt) => `${dt.slice(0, 13)}:00:00`;

/**
 * Portable upsert: read existing row inside a transaction, then update or insert.
 * Works on SQLite, MySQL, and Postgres.
 *
 * @param   {Object} trx         Knex transaction
 * @param   {number} proxyHostId
 * @param   {string} bucket
 * @param   {string} resolution  'minute'|'hour'
 * @param   {Object} counts      {requests, bytes_sent, status_2xx, status_3xx, status_4xx, status_5xx, cache_hits}
 * @returns {Promise}
 */
const upsertMetric = async (trx, proxyHostId, bucket, resolution, counts) => {
	const existing = await trx("proxy_host_metric")
		.where({ proxy_host_id: proxyHostId, bucket, resolution })
		.first();

	if (existing) {
		await trx("proxy_host_metric")
			.where({ proxy_host_id: proxyHostId, bucket, resolution })
			.update({
				requests: existing.requests + counts.requests,
				bytes_sent: Number(existing.bytes_sent) + counts.bytes_sent,
				status_2xx: existing.status_2xx + counts.status_2xx,
				status_3xx: existing.status_3xx + counts.status_3xx,
				status_4xx: existing.status_4xx + counts.status_4xx,
				status_5xx: existing.status_5xx + counts.status_5xx,
				cache_hits: existing.cache_hits + counts.cache_hits,
			});
	} else {
		await trx("proxy_host_metric").insert({
			proxy_host_id: proxyHostId,
			bucket,
			resolution,
			requests: counts.requests,
			bytes_sent: counts.bytes_sent,
			status_2xx: counts.status_2xx,
			status_3xx: counts.status_3xx,
			status_4xx: counts.status_4xx,
			status_5xx: counts.status_5xx,
			cache_hits: counts.cache_hits,
		});
	}
};

/**
 * Process one host: read new log bytes, parse lines, aggregate, write to DB.
 *
 * @param   {Object} host  ProxyHost row
 * @returns {Promise}
 */
const processHost = async (host) => {
	const logPath = `${LOG_DIR}/proxy-host-${host.id}_access.log`;

	let stat;
	try {
		stat = fs.statSync(logPath);
	} catch {
		// Log file not yet created or host never proxied — skip silently
		return;
	}

	const knex = db();

	// Load or init metric_state for this host
	let state = await knex("metric_state").where({ proxy_host_id: host.id }).first();
	const stateExists = !!state;
	if (!state) {
		state = { proxy_host_id: host.id, file_offset: 0, file_size: 0, updated_on: new Date().toISOString() };
	}

	let offset = Number(state.file_offset);
	const prevSize = Number(state.file_size);
	const currentSize = Number(stat.size);

	// Rotation/truncation: file smaller than last known position
	if (currentSize < prevSize || currentSize < offset) {
		offset = 0;
	}

	// Nothing new to read
	if (currentSize <= offset) {
		return;
	}

	const readLength = Math.min(currentSize - offset, MAX_READ_BYTES);
	const buf = Buffer.alloc(readLength);
	const fd = fs.openSync(logPath, "r");
	let bytesRead = 0;
	try {
		bytesRead = fs.readSync(fd, buf, 0, readLength, offset);
	} finally {
		fs.closeSync(fd);
	}

	const chunk = buf.subarray(0, bytesRead).toString("utf8");

	// Only process up to the last newline — carry any partial line back
	const lastNewline = chunk.lastIndexOf("\n");
	const toProcess = lastNewline >= 0 ? chunk.slice(0, lastNewline) : "";
	const newOffset = lastNewline >= 0 ? offset + Buffer.byteLength(chunk.slice(0, lastNewline + 1)) : offset;

	// Aggregate per minute bucket
	const buckets = new Map();
	for (const line of toProcess.split("\n")) {
		if (!line) continue;
		const parsed = parseLogLine(line);
		if (!parsed) continue;

		const key = minuteBucket(parsed.bucket);
		if (!buckets.has(key)) {
			buckets.set(key, { requests: 0, bytes_sent: 0, status_2xx: 0, status_3xx: 0, status_4xx: 0, status_5xx: 0, cache_hits: 0 });
		}
		const b = buckets.get(key);
		b.requests += 1;
		b.bytes_sent += parsed.bytes;
		if (parsed.cacheHit) b.cache_hits += 1;
		const s = parsed.status;
		if (s >= 200 && s < 300) b.status_2xx += 1;
		else if (s >= 300 && s < 400) b.status_3xx += 1;
		else if (s >= 400 && s < 500) b.status_4xx += 1;
		else if (s >= 500) b.status_5xx += 1;
	}

	if (buckets.size > 0) {
		await knex.transaction(async (trx) => {
			for (const [bucket, counts] of buckets) {
				await upsertMetric(trx, host.id, bucket, "minute", counts);
			}
		});
	}

	// Persist new offset and file_size
	const now = new Date().toISOString();
	if (stateExists) {
		await knex("metric_state").where({ proxy_host_id: host.id }).update({
			file_offset: newOffset,
			file_size: currentSize,
			updated_on: now,
		});
	} else {
		await knex("metric_state").insert({
			proxy_host_id: host.id,
			file_offset: newOffset,
			file_size: currentSize,
			updated_on: now,
		});
	}
};

let lastRetentionRun = 0;

/**
 * Roll up minute rows older than 48h into hourly rows and prune.
 * Hour rows older than 30 days are also pruned.
 *
 * @returns {Promise}
 */
const runRetention = async () => {
	const knex = db();
	const now = Date.now();

	// Only run hourly
	if (now - lastRetentionRun < 60 * 60 * 1000) return;
	lastRetentionRun = now;

	logger.info("Running metrics retention...");

	const cutoffMinute = new Date(now - MINUTE_RETENTION_HOURS * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
	const cutoffHour = new Date(now - HOUR_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

	// Find minute rows older than 48h
	const oldMinuteRows = await knex("proxy_host_metric")
		.where("resolution", "minute")
		.where("bucket", "<", cutoffMinute);

	if (oldMinuteRows.length > 0) {
		// Group by (proxy_host_id, hour bucket) and sum
		const hourMap = new Map();
		for (const row of oldMinuteRows) {
			const hb = hourBucket(row.bucket);
			const key = `${row.proxy_host_id}|${hb}`;
			if (!hourMap.has(key)) {
				hourMap.set(key, {
					proxy_host_id: row.proxy_host_id,
					bucket: hb,
					requests: 0,
					bytes_sent: 0,
					status_2xx: 0,
					status_3xx: 0,
					status_4xx: 0,
					status_5xx: 0,
					cache_hits: 0,
				});
			}
			const h = hourMap.get(key);
			h.requests += row.requests;
			h.bytes_sent += Number(row.bytes_sent);
			h.status_2xx += row.status_2xx;
			h.status_3xx += row.status_3xx;
			h.status_4xx += row.status_4xx;
			h.status_5xx += row.status_5xx;
			h.cache_hits += row.cache_hits;
		}

		await knex.transaction(async (trx) => {
			for (const [, agg] of hourMap) {
				await upsertMetric(trx, agg.proxy_host_id, agg.bucket, "hour", agg);
			}
			// Delete the rolled-up minute rows
			await trx("proxy_host_metric")
				.where("resolution", "minute")
				.where("bucket", "<", cutoffMinute)
				.delete();
		});
		logger.info(`Rolled up ${oldMinuteRows.length} minute rows into hour buckets`);
	}

	// Prune stale hour rows
	const deletedHour = await knex("proxy_host_metric")
		.where("resolution", "hour")
		.where("bucket", "<", cutoffHour)
		.delete();
	if (deletedHour > 0) {
		logger.info(`Pruned ${deletedHour} old hour-resolution metric rows`);
	}
};

const internalMetrics = {
	interval: null,
	interval_processing: false,

	initTimer: () => {
		logger.info("Metrics collection timer initialized");
		internalMetrics.collect();
		internalMetrics.interval = setInterval(internalMetrics.collect, COLLECT_INTERVAL);
	},

	/**
	 * Collect metrics for all enabled proxy hosts.
	 *
	 * @returns {Promise}
	 */
	collect: () => {
		if (internalMetrics.interval_processing) return;
		internalMetrics.interval_processing = true;

		ProxyHost.query()
			.where({ is_deleted: 0, enabled: 1 })
			.then(async (hosts) => {
				for (const host of hosts) {
					try {
						await processHost(host);
					} catch (err) {
						logger.error(`Error collecting metrics for host ${host.id}: ${err.message}`);
					}
				}
				await runRetention();
			})
			.catch((err) => {
				logger.error(`Metrics collect error: ${err.message}`);
			})
			.finally(() => {
				internalMetrics.interval_processing = false;
			});
	},
};

export default internalMetrics;
