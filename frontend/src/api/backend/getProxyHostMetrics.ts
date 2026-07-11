import * as api from "./base";

export type MetricsRange = "1h" | "24h" | "7d" | "30d";

export interface MetricsBucket {
	bucket: string;
	requests: number;
	bytesSent: number;
	status2xx: number;
	status3xx: number;
	status4xx: number;
	status5xx: number;
	cacheHits: number;
}

export interface ProxyHostMetricsTotals {
	requests: number;
	bytesSent: number;
	cacheHitRatio: number;
	errorRate: number;
}

export interface ProxyHostMetrics {
	range: MetricsRange;
	buckets: MetricsBucket[];
	totals: ProxyHostMetricsTotals;
}

export async function getProxyHostMetrics(id: number, range: MetricsRange): Promise<ProxyHostMetrics> {
	return await api.get({
		url: `/reports/proxy-hosts/${id}/metrics`,
		params: { range },
	});
}
