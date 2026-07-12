import * as api from "./base";

export interface BackupPlanItem {
	type: string;
	name: string;
	action: "create" | "update" | "skip" | "conflict";
}

export interface BackupImportResult {
	dryRun: boolean;
	items: BackupPlanItem[];
	summary?: Record<string, number>;
	regenerated?: Array<{ type: string; id: number; ok: boolean; error?: string }>;
}

/**
 * Upload a backup archive. With dryRun=true the server returns a per-item plan
 * without writing anything; otherwise it imports and returns a result report.
 */
export async function importBackup(file: File, passphrase: string, dryRun: boolean): Promise<BackupImportResult> {
	const data = new FormData();
	data.append("file", file);
	if (passphrase) {
		data.append("passphrase", passphrase);
	}
	return await api.post({
		url: "/backup/import",
		params: dryRun ? { dry_run: "1" } : {},
		data,
	});
}
