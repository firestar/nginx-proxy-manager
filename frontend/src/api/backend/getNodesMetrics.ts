import * as api from "./base";

export interface NodeMetrics {
	nodeId: number | null;
	requestsLast15m: number;
	lastMetricBucket: string | null;
}

export async function getNodesMetrics(): Promise<NodeMetrics[]> {
	return await api.get({ url: "/reports/nodes/metrics" });
}
