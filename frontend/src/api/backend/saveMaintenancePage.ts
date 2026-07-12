import * as api from "./base";

export async function saveMaintenancePage(id: number, html: string): Promise<boolean> {
	return await api.put({
		url: `/nginx/proxy-hosts/${id}/maintenance-page`,
		data: { html },
	});
}
