import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createNotificationChannel,
	deleteNotificationChannel,
	getNotificationChannels,
	getNotificationLogs,
	testNotificationChannel,
	updateNotificationChannel,
	type NotificationChannel,
} from "src/api/backend";

const CHANNELS_KEY = "notification-channels";
const LOGS_KEY = "notification-logs";

const useNotificationChannels = (options = {}) => {
	return useQuery<NotificationChannel[], Error>({
		queryKey: [CHANNELS_KEY],
		queryFn: getNotificationChannels,
		staleTime: 30 * 1000,
		...options,
	});
};

const useCreateNotificationChannel = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: NotificationChannel) => createNotificationChannel(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [CHANNELS_KEY] });
		},
	});
};

const useUpdateNotificationChannel = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: NotificationChannel) => updateNotificationChannel(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [CHANNELS_KEY] });
		},
	});
};

const useDeleteNotificationChannel = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteNotificationChannel(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [CHANNELS_KEY] });
		},
	});
};

const useTestNotificationChannel = () => {
	return useMutation({
		mutationFn: (id: number) => testNotificationChannel(id),
	});
};

const useNotificationLogs = (limit = 100, options = {}) => {
	return useQuery({
		queryKey: [LOGS_KEY, limit],
		queryFn: () => getNotificationLogs(limit),
		staleTime: 15 * 1000,
		...options,
	});
};

export {
	useNotificationChannels,
	useCreateNotificationChannel,
	useUpdateNotificationChannel,
	useDeleteNotificationChannel,
	useTestNotificationChannel,
	useNotificationLogs,
};
