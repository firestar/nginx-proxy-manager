import * as api from "./base";

export interface BackupRun {
	id: number;
	createdOn: string;
	status: "ok" | "failed";
	trigger: "manual" | "scheduled";
	destination: string;
	filename?: string;
	s3Key?: string;
	size: number;
	encrypted: number;
	error?: string;
}

export async function getBackupHistory(): Promise<BackupRun[]> {
	return await api.get({ url: "/backup/history" });
}
