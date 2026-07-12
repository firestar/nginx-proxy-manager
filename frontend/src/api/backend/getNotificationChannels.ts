import * as api from "./base";
import type { NotificationChannel } from "./models";

export async function getNotificationChannels(): Promise<NotificationChannel[]> {
	return await api.get({ url: "/notifications/channels" });
}
