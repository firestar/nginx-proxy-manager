import { useQuery } from "@tanstack/react-query";
import { getNodeApplyLog, type NodeApplyLogEntry } from "src/api/backend";

const useNodeApplyLog = (id: number, limit?: number, options = {}) => {
	return useQuery<NodeApplyLogEntry[], Error>({
		queryKey: ["node-apply-log", id, limit],
		queryFn: () => getNodeApplyLog(id, limit),
		staleTime: 10 * 1000,
		refetchOnWindowFocus: true,
		enabled: id > 0,
		...options,
	});
};

export { useNodeApplyLog };
