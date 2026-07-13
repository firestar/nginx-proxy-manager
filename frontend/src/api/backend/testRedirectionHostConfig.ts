import * as api from "./base";

import type { TestConfigResult } from "./testProxyHostConfig";

export async function testRedirectionHostConfig(data: Record<string, unknown>): Promise<TestConfigResult> {
	return await api.post({
		url: "/nginx/redirection-hosts/test-config",
		data,
	});
}
