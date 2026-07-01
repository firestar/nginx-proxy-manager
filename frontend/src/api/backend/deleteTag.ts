import * as api from "./base";

export async function deleteTag(id: number): Promise<boolean> {
	return await api.del({
		url: `/nginx/tags/${id}`,
	});
}
