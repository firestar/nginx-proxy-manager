import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { npmRequest } from "../npm-client.js";
import { scopedRegistrar } from "./helpers.js";

const registerTool = scopedRegistrar("uptime");

export function registerUptimeTools(server: McpServer): void {
	registerTool(
		server,
		"npm_get_uptime",
		{
			title: "Get upstream uptime",
			description: "Get current upstream status and uptime percentages (24h/7d/90d) for all monitored proxy hosts.",
			readOnly: true,
			inputSchema: {},
		},
		() => npmRequest("GET", "/reports/uptime"),
	);
}
