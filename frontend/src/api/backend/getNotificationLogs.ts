import * as api from "./base";
import type { NotificationLog } from "./models";

export async function getNotificationLogs(limit = 100): Promise<NotificationLog[]> {
	return await api.get({ url: "/notifications/logs", params: { limit } });
}
