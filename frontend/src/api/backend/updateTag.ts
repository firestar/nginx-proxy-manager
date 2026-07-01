import * as api from "./base";
import type { Tag } from "./models";

export async function updateTag(item: Tag): Promise<Tag> {
	// Remove readonly fields
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/nginx/tags/${id}`,
		data: data,
	});
}
