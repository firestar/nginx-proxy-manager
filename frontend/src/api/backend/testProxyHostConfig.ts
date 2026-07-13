import * as api from "./base";

export interface TestConfigResult {
	ok: boolean;
	errors?: string;
	tested_locally?: boolean;
}

export async function testProxyHostConfig(data: Record<string, unknown>): Promise<TestConfigResult> {
	return await api.post({
		url: "/nginx/proxy-hosts/test-config",
		data,
	});
}
