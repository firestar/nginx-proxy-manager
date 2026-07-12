import { useQuery } from "@tanstack/react-query";
import { type BackupRun, getBackupHistory } from "src/api/backend";

const useBackupHistory = (options = {}) => {
	return useQuery<BackupRun[], Error>({
		queryKey: ["backup-history"],
		queryFn: getBackupHistory,
		staleTime: 30 * 1000,
		...options,
	});
};

export { useBackupHistory };
