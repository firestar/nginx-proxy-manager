import errs from "../lib/error.js";
import db from "../db.js";
import { uptimePercent } from "./uptime-helpers.js";
import internalDeadHost from "./dead-host.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalStream from "./stream.js";

const RANGE_CONFIG = {
	"1h": { windowMs: 3600000, resolution: "minute", stepMs: 60000 }, // 60 points
	"24h": { windowMs: 86400000, resolution: "minute", stepMs: 900000 }, // 96 points (15 min)
	"7d": { windowMs: 604800000, resolution: "hour", stepMs: 3600000 }, // 168 points
	"30d": { windowMs: 2592000000, resolution: "hour", stepMs: 21600000 }, // 120 points (6 h)
};

// Bucket datetimes are stored as UTC strings; MySQL drivers may return Date objects
const toEpoch = (bucket) =>
	bucket instanceof Date ? bucket.getTime() : Date.parse(`${String(bucket).replace(" ", "T")}Z`);

/**
 * Downsample DB metric rows into at most ~240 output buckets grouped by stepMs.
 * Returns a Map<epochMs, aggregated bucket>.
 */
const groupBuckets = (rows, stepMs) => {
	const grouped = new Map();
	for (const r of rows) {
		const epoch = toEpoch(r.bucket);
		if (Number.isNaN(epoch)) continue;
		const key = Math.floor(epoch / stepMs) * stepMs;
		if (!grouped.has(key)) {
			grouped.set(key, {
				bucket: new Date(key).toISOString().replace("T", " ").slice(0, 19),
				requests: 0,
				bytesSent: 0,
				status2xx: 0,
				status3xx: 0,
				status4xx: 0,
				status5xx: 0,
				cacheHits: 0,
			});
		}
		const g = grouped.get(key);
		g.requests += r.requests;
		g.bytesSent += Number(r.bytes_sent);
		g.status2xx += r.status_2xx;
		g.status3xx += r.status_3xx;
		g.status4xx += r.status_4xx;
		g.status5xx += r.status_5xx;
		g.cacheHits += r.cache_hits;
	}
	return grouped;
};

const bucketTotals = (buckets) => {
	const totalRequests = buckets.reduce((s, b) => s + b.requests, 0);
	const totalBytesSent = buckets.reduce((s, b) => s + b.bytesSent, 0);
	const totalCacheHits = buckets.reduce((s, b) => s + b.cacheHits, 0);
	const totalErrors = buckets.reduce((s, b) => s + b.status4xx + b.status5xx, 0);
	return {
		requests: totalRequests,
		bytesSent: totalBytesSent,
		cacheHitRatio: totalRequests > 0 ? totalCacheHits / totalRequests : 0,
		errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
	};
};

const internalReport = {
	/**
	 * @param  {Access}   access
	 * @return {Promise}
	 */
	getHostsReport: (access) => {
		return access
			.can("reports:hosts", 1)
			.then((access_data) => {
				const userId = access.token.getUserId(1);

				const promises = [
					internalProxyHost.getCount(userId, access_data.permission_visibility),
					internalRedirectionHost.getCount(userId, access_data.permission_visibility),
					internalStream.getCount(userId, access_data.permission_visibility),
					internalDeadHost.getCount(userId, access_data.permission_visibility),
				];

				return Promise.all(promises);
			})
			.then((counts) => {
				return {
					proxy: counts.shift(),
					redirection: counts.shift(),
					stream: counts.shift(),
					dead: counts.shift(),
				};
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {string}  [data.range]      1h|24h|7d|30d (default 24h)
	 * @param  {boolean} [data.breakdown]  include per-node breakdown in response
	 * @return {Promise}
	 */
	getProxyHostMetrics: async (access, data) => {
		const range = data.range || "24h";
		const cfg = RANGE_CONFIG[range];
		if (!cfg) {
			throw new errs.ValidationError(`Invalid range: ${range}. Must be one of ${Object.keys(RANGE_CONFIG).join(", ")}`);
		}

		// Verify host exists and user can access it (throws 404/403 if not)
		await internalProxyHost.get(access, { id: data.id });

		const cutoff = new Date(Date.now() - cfg.windowMs).toISOString().replace("T", " ").slice(0, 19);

		const knex = db();
		const rows = await knex("proxy_host_metric")
			.where({ proxy_host_id: data.id, resolution: cfg.resolution })
			.where("bucket", ">=", cutoff)
			.orderBy("bucket", "asc");

		// Aggregate across all nodes (default)
		const grouped = groupBuckets(rows, cfg.stepMs);
		const buckets = [...grouped.keys()].sort((a, b) => a - b).map((k) => grouped.get(k));

		const result = {
			range,
			buckets,
			totals: bucketTotals(buckets),
		};

		// Optional per-node breakdown
		if (data.breakdown) {
			const nodeIds = [...new Set(rows.map((r) => r.node_id))];
			result.nodes = nodeIds.map((nodeId) => {
				const nodeRows = rows.filter((r) => r.node_id === nodeId);
				const ng = groupBuckets(nodeRows, cfg.stepMs);
				const nb = [...ng.keys()].sort((a, b) => a - b).map((k) => ng.get(k));
				return { nodeId, totals: bucketTotals(nb) };
			});
		}

		return result;
	},

	/**
	 * @param  {Access} access
	 * @return {Promise}
	 */
	getUptimeReport: async (access) => {
		await access.can("reports:hosts", 1);
		const knex = db();
		const now = Date.now();
		const windows = {
			d1: now - 24 * 60 * 60 * 1000,
			d7: now - 7 * 24 * 60 * 60 * 1000,
			d90: now - 90 * 24 * 60 * 60 * 1000,
		};

		const hosts = await knex("proxy_host")
			.where({ is_deleted: 0, enabled: 1, check_enabled: 1 })
			.select("id", "domain_names");

		const result = [];
		for (const host of hosts) {
			const status = await knex("upstream_status").where("proxy_host_id", host.id).first();
			const downEvents = await knex("uptime_event")
				.where("proxy_host_id", host.id)
				.where("status", "down")
				.select("started_on", "ended_on");

			result.push({
				id: host.id,
				domain_names: typeof host.domain_names === "string" ? JSON.parse(host.domain_names) : host.domain_names,
				status: status ? status.status : "unknown",
				latency_ms: status ? status.latency_ms : null,
				last_checked: status ? status.last_checked : null,
				uptime: {
					d1: uptimePercent(downEvents, windows.d1, now),
					d7: uptimePercent(downEvents, windows.d7, now),
					d90: uptimePercent(downEvents, windows.d90, now),
				},
			});
		}
		return result;
	},

	/**
	 * Per-node request rate (last 15 min) and last metric bucket received.
	 * Used by the Nodes page to show per-node activity at a glance.
	 *
	 * @param  {Access} access
	 * @return {Promise}
	 */
	getNodesMetrics: async (access) => {
		await access.can("nodes:list");
		const knex = db();
		const windowMs = 15 * 60 * 1000;
		const cutoff = new Date(Date.now() - windowMs).toISOString().replace("T", " ").slice(0, 19);

		// Sum requests in the last 15 min, grouped by node_id
		const rows = await knex("proxy_host_metric")
			.where("resolution", "minute")
			.where("bucket", ">=", cutoff)
			.groupBy("node_id")
			.select("node_id")
			.sum("requests as total_requests");

		// Latest bucket per node (across all resolutions and time)
		const lastBuckets = await knex("proxy_host_metric")
			.whereNotNull("node_id")
			.groupBy("node_id")
			.select("node_id")
			.max("bucket as last_bucket");

		const rateMap = new Map();
		for (const r of rows) {
			rateMap.set(r.node_id, Number(r.total_requests));
		}
		const lastMap = new Map();
		for (const r of lastBuckets) {
			lastMap.set(r.node_id, r.last_bucket);
		}

		const nodeIds = [...new Set([...rateMap.keys(), ...lastMap.keys()])];
		return nodeIds.map((nodeId) => ({
			nodeId,
			requestsLast15m: rateMap.get(nodeId) || 0,
			lastMetricBucket: lastMap.get(nodeId) || null,
		}));
	},


	/**
	 * Aggregate metrics overview: time-series across all visible proxy hosts + per-host totals.
	 *
	 * @param  {Access} access
	 * @param  {Object} data
	 * @param  {string} [data.range] 1h|24h|7d|30d (default 24h)
	 * @return {Promise}
	 */
	getMetricsOverview: async (access, data) => {
		const range = (data && data.range) || "24h";
		const cfg = RANGE_CONFIG[range];
		if (!cfg) {
			throw new errs.ValidationError(`Invalid range: ${range}. Must be one of ${Object.keys(RANGE_CONFIG).join(", ")}`);
		}

		const access_data = await access.can("proxy_hosts:list");
		const userId = access.token.getUserId(1);
		const visibility = typeof access_data === "object" ? access_data.permission_visibility : "all";

		const knex = db();

		let hostQuery = knex("proxy_host").where({ is_deleted: 0 }).select("id", "domain_names");
		if (visibility === "user") {
			hostQuery = hostQuery.where("owner_user_id", userId);
		} else if (visibility === "tags") {
			const tagRows = await knex("user_tag").select("tag_id").where("user_id", userId);
			const tagIds = tagRows.map((r) => r.tag_id);
			const ids = tagIds.length ? tagIds : [0];
			hostQuery = hostQuery.whereExists(
				knex.select(knex.raw("1")).from("proxy_host_tag")
					.where("proxy_host_tag.proxy_host_id", knex.ref("proxy_host.id"))
					.whereIn("proxy_host_tag.tag_id", ids),
			);
		}

		const hosts = await hostQuery;
		if (!hosts.length) {
			return { range, series: [], totals: bucketTotals([]), hosts: [] };
		}

		const hostIds = hosts.map((h) => h.id);
		const cutoff = new Date(Date.now() - cfg.windowMs).toISOString().replace("T", " ").slice(0, 19);

		const rows = await knex("proxy_host_metric")
			.whereIn("proxy_host_id", hostIds)
			.where({ resolution: cfg.resolution })
			.where("bucket", ">=", cutoff)
			.orderBy("bucket", "asc");

		const grouped = groupBuckets(rows, cfg.stepMs);
		const series = [...grouped.keys()].sort((a, b) => a - b).map((k) => grouped.get(k));

		const hostTotals = hosts.map((h) => {
			const hostRows = rows.filter((r) => r.proxy_host_id === h.id);
			const hg = groupBuckets(hostRows, cfg.stepMs);
			const hb = [...hg.keys()].map((k) => hg.get(k));
			const totals = bucketTotals(hb);
			const domainNames = typeof h.domain_names === "string" ? JSON.parse(h.domain_names) : h.domain_names;
			return {
				id: h.id,
				domain_names: domainNames,
				requests: totals.requests,
				bytesSent: totals.bytesSent,
				errorRate: totals.errorRate,
				cacheHitRate: totals.cacheHitRatio,
			};
		}).sort((a, b) => b.requests - a.requests);

		return {
			range,
			series,
			totals: bucketTotals(series),
			hosts: hostTotals,
		};
	},

	/**
	 * Per-node aggregated timeseries from proxy_host_metric.
	 *
	 * @param  {Access} access
	 * @param  {Object} data
	 * @param  {number} data.id      node id
	 * @param  {string} [data.range] 1h|24h|7d|30d (default 24h)
	 * @return {Promise}
	 */
	getNodeMetrics: async (access, data) => {
		const range = data.range || "24h";
		const cfg = RANGE_CONFIG[range];
		if (!cfg) {
			throw new errs.ValidationError(`Invalid range: ${range}. Must be one of ${Object.keys(RANGE_CONFIG).join(", ")}`);
		}

		await access.can("nodes:get");

		const cutoff = new Date(Date.now() - cfg.windowMs).toISOString().replace("T", " ").slice(0, 19);

		const knex = db();
		const rows = await knex("proxy_host_metric")
			.where({ node_id: data.id, resolution: cfg.resolution })
			.where("bucket", ">=", cutoff)
			.orderBy("bucket", "asc");

		const grouped = groupBuckets(rows, cfg.stepMs);
		const buckets = [...grouped.keys()].sort((a, b) => a - b).map((k) => grouped.get(k));

		return {
			range,
			buckets,
			totals: bucketTotals(buckets),
		};
	},
};

export default internalReport;
