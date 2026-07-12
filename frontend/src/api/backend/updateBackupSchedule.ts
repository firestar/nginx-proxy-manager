import * as api from "./base";
import type { BackupSchedule } from "./getBackupSchedule";

/**
 * Update the backup schedule. Secret fields (passphrase, s3.secretKey) are
 * write-only: leave them empty to keep the stored value.
 */
export async function updateBackupSchedule(data: Record<string, any>): Promise<BackupSchedule> {
	return await api.put({ url: "/backup/schedule", data });
}

/** Trigger a backup immediately (uploads to S3 when configured). */
export async function runBackupNow(): Promise<any> {
	return await api.post({ url: "/backup/run" });
}
