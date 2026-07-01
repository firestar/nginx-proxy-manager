import * as api from "./base";
import type { TagExpansion } from "./expansions";
import type { Tag } from "./models";

export async function getTag(id: number, expand?: TagExpansion[], params = {}): Promise<Tag> {
	return await api.get({
		url: `/nginx/tags/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
