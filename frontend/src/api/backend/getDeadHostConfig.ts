import * as api from "./base";

export async function getDeadHostConfig(id: number): Promise<{ config: string }> {
	return await api.get({
		url: `/nginx/dead-hosts/${id}/config`,
	});
}
