import { useQuery } from "@tanstack/react-query";
import { getNodesMetrics, type NodeMetrics } from "src/api/backend";

const useNodesMetrics = (options = {}) => {
	return useQuery<NodeMetrics[], Error>({
		queryKey: ["nodes-metrics"],
		queryFn: getNodesMetrics,
		refetchInterval: 30 * 1000,
		staleTime: 29 * 1000,
		refetchOnWindowFocus: false,
		...options,
	});
};

export { useNodesMetrics };
