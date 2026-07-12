import { useQuery } from "@tanstack/react-query";
import { getNodes, type NPMNode } from "src/api/backend";

const fetchNodes = () => {
	return getNodes();
};

const useNodes = (options = {}) => {
	return useQuery<NPMNode[], Error>({
		queryKey: ["nodes"],
		queryFn: fetchNodes,
		staleTime: 30 * 1000,
		retry: false,
		...options,
	});
};

export { fetchNodes, useNodes };
