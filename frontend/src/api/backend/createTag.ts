import * as api from "./base";
import type { Tag } from "./models";

export async function createTag(item: Tag): Promise<Tag> {
	return await api.post({
		url: "/nginx/tags",
		data: item,
	});
}
