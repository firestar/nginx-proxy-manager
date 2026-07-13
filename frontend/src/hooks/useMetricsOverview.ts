import { useQuery } from "@tanstack/react-query";
import { getMetricsOverview, type MetricsOverview, type MetricsRange } from "src/api/backend";

const useMetricsOverview = (range: MetricsRange, options = {}) => {
	return useQuery<MetricsOverview, Error>({
		queryKey: ["metrics-overview", range],
		queryFn: () => getMetricsOverview(range),
		refetchInterval: 30 * 1000,
		staleTime: 29 * 1000,
		refetchOnWindowFocus: false,
		...options,
	});
};

export { useMetricsOverview };
