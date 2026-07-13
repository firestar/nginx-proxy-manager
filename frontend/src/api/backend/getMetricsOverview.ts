import * as api from "./base";
import type { MetricsBucket, MetricsRange, ProxyHostMetricsTotals } from "./getProxyHostMetrics";

export interface HostMetricsTotals {
	id: number;
	domain_names: string[];
	requests: number;
	bytesSent: number;
	errorRate: number;
	cacheHitRate: number;
}

export interface MetricsOverview {
	range: MetricsRange;
	series: MetricsBucket[];
	totals: ProxyHostMetricsTotals;
	hosts: HostMetricsTotals[];
}

export async function getMetricsOverview(range: MetricsRange): Promise<MetricsOverview> {
	return await api.get({
		url: "/reports/proxy-hosts/metrics",
		params: { range },
	});
}
