import * as api from "./base";
import type { NPMNode } from "./models";

export async function createNode(item: { name: string }): Promise<NPMNode> {
	return await api.post({
		url: "/nodes",
		data: item,
	});
}
