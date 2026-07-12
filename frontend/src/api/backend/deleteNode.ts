import * as api from "./base";

export async function deleteNode(id: number): Promise<boolean> {
	return await api.del({
		url: `/nodes/${id}`,
	});
}
