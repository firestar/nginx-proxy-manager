import * as api from "./base";
import type { ApiKey } from "./models";

export async function getApiKeys(params = {}): Promise<ApiKey[]> {
	return await api.get({
		url: "/api-keys",
		params,
	});
}
