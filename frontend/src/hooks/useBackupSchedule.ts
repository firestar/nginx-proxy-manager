import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type BackupSchedule, getBackupSchedule, updateBackupSchedule } from "src/api/backend";

const useBackupSchedule = (options = {}) => {
	return useQuery<BackupSchedule, Error>({
		queryKey: ["backup-schedule"],
		queryFn: getBackupSchedule,
		staleTime: 60 * 1000,
		...options,
	});
};

const useSetBackupSchedule = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Record<string, any>) => updateBackupSchedule(values),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["backup-schedule"] });
		},
	});
};

export { useBackupSchedule, useSetBackupSchedule };
