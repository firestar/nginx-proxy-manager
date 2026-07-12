import * as api from "./base";
import type { NPMNode } from "./models";

export async function regenerateNodeToken(id: number): Promise<NPMNode> {
	return await api.post({
		url: `/nodes/${id}/token`,
	});
}
