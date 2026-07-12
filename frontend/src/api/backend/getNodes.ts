import * as api from "./base";
import type { NPMNode } from "./models";

export async function getNodes(): Promise<NPMNode[]> {
	return await api.get({
		url: "/nodes",
	});
}
