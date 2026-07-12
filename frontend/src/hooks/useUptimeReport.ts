import { useQuery } from "@tanstack/react-query";
import { getUptimeReport, type UpstreamStatus } from "src/api/backend";

const useUptimeReport = (options = {}) => {
	return useQuery<UpstreamStatus[], Error>({
		queryKey: ["uptime-report"],
		queryFn: getUptimeReport,
		refetchInterval: 30 * 1000,
		staleTime: 29 * 1000,
		refetchOnWindowFocus: false,
		...options,
	});
};

export { useUptimeReport };
