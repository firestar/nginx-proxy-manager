import * as api from "./base";

import type { TestConfigResult } from "./testProxyHostConfig";

export async function testStreamConfig(data: Record<string, unknown>): Promise<TestConfigResult> {
	return await api.post({
		url: "/nginx/streams/test-config",
		data,
	});
}
