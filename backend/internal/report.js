import errs from "../lib/error.js";
import db from "../db.js";
import internalDeadHost from "./dead-host.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalStream from "./stream.js";

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
	 * @param  {string}  [data.range]  1h|24h|7d|30d (default 24h)
	 * @return {Promise}
	 */
	getProxyHostMetrics: async (access, data) => {
		const range = data.range || "24h";
		// stepMs downsamples DB rows into at most ~240 output buckets per range —
		// rendering 1440 raw minute rows locks up the charts in the browser.
		const RANGE_CONFIG = {
			"1h": { windowMs: 3600000, resolution: "minute", stepMs: 60000 }, // 60 points
			"24h": { windowMs: 86400000, resolution: "minute", stepMs: 900000 }, // 96 points (15 min)
			"7d": { windowMs: 604800000, resolution: "hour", stepMs: 3600000 }, // 168 points
			"30d": { windowMs: 2592000000, resolution: "hour", stepMs: 21600000 }, // 120 points (6 h)
		};
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

		// Bucket datetimes are stored as UTC strings; MySQL drivers may return Date objects
		const toEpoch = (bucket) =>
			bucket instanceof Date ? bucket.getTime() : Date.parse(`${String(bucket).replace(" ", "T")}Z`);

		const grouped = new Map();
		for (const r of rows) {
			const epoch = toEpoch(r.bucket);
			if (Number.isNaN(epoch)) continue;
			const key = Math.floor(epoch / cfg.stepMs) * cfg.stepMs;
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
		const buckets = [...grouped.keys()].sort((a, b) => a - b).map((k) => grouped.get(k));

		const totalRequests = buckets.reduce((s, b) => s + b.requests, 0);
		const totalBytesSent = buckets.reduce((s, b) => s + b.bytesSent, 0);
		const totalCacheHits = buckets.reduce((s, b) => s + b.cacheHits, 0);
		const totalErrors = buckets.reduce((s, b) => s + b.status4xx + b.status5xx, 0);

		return {
			range,
			buckets,
			totals: {
				requests: totalRequests,
				bytesSent: totalBytesSent,
				cacheHitRatio: totalRequests > 0 ? totalCacheHits / totalRequests : 0,
				errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
			},
		};
	},
};

export default internalReport;
