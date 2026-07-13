import * as api from "./base";

export async function getProxyHostConfig(id: number): Promise<{ config: string }> {
	return await api.get({
		url: `/nginx/proxy-hosts/${id}/config`,
	});
}
