import { z } from "zod";
import { toolRegistrar } from "../helpers.js";

export function registerUptimeTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx, "uptime");

	registerTool(
		"npm_get_uptime",
		{
			title: "Get upstream uptime",
			description: "Get current upstream status and uptime percentages (24h/7d/90d) for all monitored proxy hosts.",
			readOnly: true,
			inputSchema: {},
		},
		() => ctx.request("GET", "/reports/uptime"),
	);
}
