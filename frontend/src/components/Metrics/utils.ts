export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

export const bucketToEpoch = (bucket: string): number =>
	Date.parse(`${bucket.replace(" ", "T")}Z`);
