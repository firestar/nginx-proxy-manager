import * as api from "./base";

export async function getRedirectionHostConfig(id: number): Promise<{ config: string }> {
	return await api.get({
		url: `/nginx/redirection-hosts/${id}/config`,
	});
}
