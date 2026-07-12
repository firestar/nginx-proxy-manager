import * as api from "./base";
import type { NotificationChannel } from "./models";

export async function updateNotificationChannel(item: NotificationChannel): Promise<NotificationChannel> {
	const { id, ...data } = item;
	return await api.put({ url: `/notifications/channels/${id}`, data });
}
