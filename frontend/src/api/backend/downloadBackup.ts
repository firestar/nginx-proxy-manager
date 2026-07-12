import * as api from "./base";

/** Download a backup archive. Pass a passphrase to receive an encrypted archive. */
export async function downloadBackup(passphrase?: string): Promise<void> {
	const stamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
	const filename = `npm-backup-${stamp}.tar.gz${passphrase ? ".enc" : ""}`;
	await api.download({ url: "/backup", params: passphrase ? { passphrase } : {} }, filename);
}
