import * as api from "./base";

export async function setUserTags(userId: number, tagIds: number[]): Promise<boolean> {
	return await api.put({
		url: `/users/${userId}/tags`,
		data: { tag_ids: tagIds },
	});
}
