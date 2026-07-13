import * as api from "./base";

import type { TestConfigResult } from "./testProxyHostConfig";

export async function testDeadHostConfig(data: Record<string, unknown>): Promise<TestConfigResult> {
	return await api.post({
		url: "/nginx/dead-hosts/test-config",
		data,
	});
}
