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
		const VALID_RANGES = ["1h", "24h", "7d", "30d"];
		if (!VALID_RANGES.includes(range)) {
			throw new errs.ValidationError(`Invalid range: ${range}. Must be one of ${VALID_RANGES.join(", ")}`);
		}

		// Verify host exists and user can access it (throws 404/403 if not)
		await internalProxyHost.get(access, { id: data.id });

		const resolution = range === "1h" || range === "24h" ? "minute" : "hour";
		const windowMs = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 }[range];
		const cutoff = new Date(Date.now() - windowMs).toISOString().replace("T", " ").slice(0, 19);

		const knex = db();
		const rows = await knex("proxy_host_metric")
			.where({ proxy_host_id: data.id, resolution })
			.where("bucket", ">=", cutoff)
			.orderBy("bucket", "asc");

		const buckets = rows.map((r) => ({
			bucket: r.bucket,
			requests: r.requests,
			bytesSent: Number(r.bytes_sent),
			status2xx: r.status_2xx,
			status3xx: r.status_3xx,
			status4xx: r.status_4xx,
			status5xx: r.status_5xx,
			cacheHits: r.cache_hits,
		}));

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
