import * as api from "./base";

export async function getStreamConfig(id: number): Promise<{ config: string }> {
	return await api.get({
		url: `/nginx/streams/${id}/config`,
	});
}
