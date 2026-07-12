import * as api from "./base";

export async function getMaintenancePage(id: number): Promise<{ html: string }> {
	return await api.get({
		url: `/nginx/proxy-hosts/${id}/maintenance-page`,
	});
}
