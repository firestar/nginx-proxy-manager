import { useQuery } from "@tanstack/react-query";
import { getNodeMetrics, type MetricsRange, type NodeMetricsResult } from "src/api/backend";

const useNodeMetrics = (id: number, range: MetricsRange, options = {}) => {
	return useQuery<NodeMetricsResult, Error>({
		queryKey: ["node-metrics", id, range],
		queryFn: () => getNodeMetrics(id, range),
		refetchInterval: 30 * 1000,
		staleTime: 29 * 1000,
		refetchOnWindowFocus: false,
		enabled: id > 0,
		...options,
	});
};

export { useNodeMetrics };
