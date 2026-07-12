import { toolRegistrar } from "../helpers.js";

export function registerBackupTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx, "backup");

	registerTool(
		"npm_create_backup",
		{
			title: "Create backup",
			description:
				"Create a backup now. If a scheduled S3/MinIO destination is configured the archive is uploaded " +
				"there and pruned to the retention count; otherwise a local archive is produced. Returns the run result.",
			inputSchema: {},
		},
		() => ctx.request("POST", "/backup/run"),
	);

	registerTool(
		"npm_get_backup_schedule",
		{
			title: "Get backup schedule",
			description:
				"Get the scheduled backup configuration (cron, retention, S3/MinIO endpoint & bucket). " +
				"Secret fields are never returned — only whether they are set.",
			readOnly: true,
			inputSchema: {},
		},
		() => ctx.request("GET", "/backup/schedule"),
	);
}
