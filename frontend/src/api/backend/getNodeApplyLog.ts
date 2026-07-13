import * as api from "./base";

export interface NodeApplyLogEntry {
	id: number;
	nodeId: number;
	version: number;
	ok: boolean;
	error: string | null;
	createdOn: string;
}

export async function getNodeApplyLog(id: number, limit?: number): Promise<NodeApplyLogEntry[]> {
	return await api.get({
		url: `/nodes/${id}/apply-log`,
		params: limit ? { limit } : undefined,
	});
}
