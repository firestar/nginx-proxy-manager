import * as api from "./base";

export async function testNotificationChannel(id: number): Promise<{ success: boolean; error: string | null }> {
	return await api.post({ url: `/notifications/channels/${id}/test` });
}
