import * as api from "./base";
import type { NPMNode } from "./models";

export async function getNode(id: number): Promise<NPMNode> {
	return await api.get({
		url: `/nodes/${id}`,
	});
}
