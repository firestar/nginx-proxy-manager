import { useQuery } from "@tanstack/react-query";
import { getNode, type NPMNode } from "src/api/backend";

const useNode = (id: number, options = {}) => {
	return useQuery<NPMNode, Error>({
		queryKey: ["node", id],
		queryFn: () => getNode(id),
		staleTime: 30 * 1000,
		enabled: id > 0,
		...options,
	});
};

export { useNode };
