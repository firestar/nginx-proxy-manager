import * as api from "./base";
import type { NPMNode } from "./models";

export async function updateNode(id: number, item: { name: string }): Promise<NPMNode> {
	return await api.put({
		url: `/nodes/${id}`,
		data: item,
	});
}
