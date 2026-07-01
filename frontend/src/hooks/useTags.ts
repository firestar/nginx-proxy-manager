import { useQuery } from "@tanstack/react-query";
import { getTags, type Tag, type TagExpansion } from "src/api/backend";

const fetchTags = (expand?: TagExpansion[]) => {
	return getTags(expand);
};

const useTags = (expand?: TagExpansion[], options = {}) => {
	return useQuery<Tag[], Error>({
		queryKey: ["tags", { expand }],
		queryFn: () => fetchTags(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchTags, useTags };
