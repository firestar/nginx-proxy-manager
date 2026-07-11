import { useQuery } from "@tanstack/react-query";
import { getProxyHostMetrics, type MetricsRange, type ProxyHostMetrics } from "src/api/backend";

const useProxyHostMetrics = (id: number, range: MetricsRange, options = {}) => {
	return useQuery<ProxyHostMetrics, Error>({
		queryKey: ["proxy-host-metrics", id, range],
		queryFn: () => getProxyHostMetrics(id, range),
		refetchInterval: 30 * 1000,
		staleTime: 29 * 1000,
		refetchOnWindowFocus: false,
		enabled: id > 0,
		...options,
	});
};

export { useProxyHostMetrics };
