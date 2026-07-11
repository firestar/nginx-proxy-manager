import * as api from "./base";
import type { ApiKey } from "./models";

export async function createApiKey(item: { name: string; scopes?: string[] }): Promise<ApiKey> {
	return await api.post({
		url: "/api-keys",
		data: item,
	});
}
