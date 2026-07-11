import * as api from "./base";
import type { ApiKey } from "./models";

export async function rerollApiKey(id: number): Promise<ApiKey> {
	return await api.post({
		url: `/api-keys/${id}/reroll`,
	});
}
