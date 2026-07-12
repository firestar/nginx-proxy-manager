import * as api from "./base";

export interface BackupScheduleS3 {
	endpoint: string;
	region: string;
	bucket: string;
	accessKey: string;
	hasSecretKey: boolean;
	prefix: string;
	forcePathStyle: boolean;
}

export interface BackupSchedule {
	enabled: boolean;
	cron: string;
	retentionCount: number;
	encrypt: boolean;
	hasPassphrase: boolean;
	s3: BackupScheduleS3;
}

export async function getBackupSchedule(): Promise<BackupSchedule> {
	return await api.get({ url: "/backup/schedule" });
}
