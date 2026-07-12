import * as api from "./base";
import type { UpstreamStatus } from "./models";

export async function getUptimeReport(): Promise<UpstreamStatus[]> {
	return await api.get({ url: "/reports/uptime" });
}
