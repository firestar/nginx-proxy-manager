import * as api from "./base";

export async function syncNode(id: number): Promise<{ ok: boolean }> {
	return await api.post({
		url: `/nodes/${id}/sync`,
	});
}
