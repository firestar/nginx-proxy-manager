import * as api from "./base";

export async function setMaintenanceMode(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({
		url: `/nginx/proxy-hosts/${id}/maintenance`,
		data: { enabled },
	});
}
