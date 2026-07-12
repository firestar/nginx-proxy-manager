import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { npmRequest } from "../npm-client.js";
import { scopedRegistrar } from "./helpers.js";

// Gate every tool in this file behind the key's backup scope.
const registerTool = scopedRegistrar("backup");

const BASE = "/backup";

export function registerBackupTools(server: McpServer): void {
	registerTool(
		server,
		"npm_create_backup",
		{
			title: "Create backup",
			description:
				"Create a backup now. If a scheduled S3/MinIO destination is configured it is uploaded there and " +
				"pruned to the retention count; otherwise a local archive is produced. Returns the run result.",
			inputSchema: {},
		},
		() => npmRequest("POST", `${BASE}/run`),
	);

	registerTool(
		server,
		"npm_get_backup_schedule",
		{
			title: "Get backup schedule",
			description:
				"Get the scheduled backup configuration (cron, retention, S3/MinIO endpoint & bucket). " +
				"Secret fields are never returned — only whether they are set.",
			readOnly: true,
			inputSchema: {},
		},
		() => npmRequest("GET", `${BASE}/schedule`),
	);
}
