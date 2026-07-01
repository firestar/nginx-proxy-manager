import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTag, getTag, type Tag, type TagExpansion, updateTag } from "src/api/backend";

const fetchTag = (id: number | "new", expand: TagExpansion[] = ["owner"]) => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			name: "",
			color: "",
			meta: {},
		} as Tag);
	}
	return getTag(id, expand);
};

const useTag = (id: number | "new", expand?: TagExpansion[], options = {}) => {
	return useQuery<Tag, Error>({
		queryKey: ["tag", id, expand],
		queryFn: () => fetchTag(id, expand),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetTag = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Tag) => (values.id ? updateTag(values) : createTag(values)),
		onMutate: (values: Tag) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["tag", values.id]);
			queryClient.setQueryData(["tag", values.id], (old: Tag) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["tag", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: Tag) => {
			queryClient.invalidateQueries({ queryKey: ["tag", id] });
			queryClient.invalidateQueries({ queryKey: ["tags"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
			// Tag renames should reflect on host tables
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
			queryClient.invalidateQueries({ queryKey: ["streams"] });
		},
	});
};

export { useSetTag, useTag };
