import * as api from "./base";
import type { MetricsBucket, MetricsRange, ProxyHostMetricsTotals } from "./getProxyHostMetrics";

export interface NodeMetricsResult {
	range: MetricsRange;
	buckets: MetricsBucket[];
	totals: ProxyHostMetricsTotals;
}

export async function getNodeMetrics(id: number, range: MetricsRange): Promise<NodeMetricsResult> {
	return await api.get({
		url: `/reports/nodes/${id}/metrics`,
		params: { range },
	});
}
