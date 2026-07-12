import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { npmRequest } from "../npm-client.js";
import { scopedRegistrar, splitId } from "./helpers.js";

const registerTool = scopedRegistrar("notifications");

const BASE = "/notifications";

const channelType = z
	.enum(["webhook", "slack", "discord", "telegram", "ntfy", "email"])
	.describe("Notification channel type");

const events = z
	.array(
		z.enum(["host.offline", "host.online", "certificate.expiring", "certificate.renewal_failed"]),
	)
	.describe("Events to notify on");

const configShape = z.record(z.unknown()).optional().describe("Type-specific config object");

export function registerNotificationTools(server: McpServer): void {
	registerTool(
		server,
		"npm_list_notification_channels",
		{
			title: "List notification channels",
			description: "List all notification channels.",
			readOnly: true,
			inputSchema: {},
		},
		() => npmRequest("GET", `${BASE}/channels`),
	);

	registerTool(
		server,
		"npm_get_notification_channel",
		{
			title: "Get notification channel",
			description: "Get a single notification channel by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("GET", `${BASE}/channels/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_create_notification_channel",
		{
			title: "Create notification channel",
			description: "Create a notification channel (webhook, Slack, Discord, Telegram, ntfy, or email).",
			inputSchema: {
				name: z.string().min(1).describe("Channel name"),
				type: channelType,
				config: configShape,
				events,
				enabled: z.boolean().optional(),
			},
		},
		(args) => npmRequest("POST", `${BASE}/channels`, { body: args }),
	);

	registerTool(
		server,
		"npm_update_notification_channel",
		{
			title: "Update notification channel",
			description: "Update an existing notification channel.",
			inputSchema: {
				id: z.number().int(),
				name: z.string().min(1).optional(),
				type: channelType.optional(),
				config: configShape,
				events: events.optional(),
				enabled: z.boolean().optional(),
			},
		},
		(args) => {
			const { id, body } = splitId(args);
			return npmRequest("PUT", `${BASE}/channels/${id}`, { body });
		},
	);

	registerTool(
		server,
		"npm_delete_notification_channel",
		{
			title: "Delete notification channel",
			description: "Soft-delete a notification channel by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("DELETE", `${BASE}/channels/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_test_notification_channel",
		{
			title: "Test notification channel",
			description: "Send a test notification to a channel and return delivery result.",
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("POST", `${BASE}/channels/${Number(args.id)}/test`),
	);

	registerTool(
		server,
		"npm_list_notification_logs",
		{
			title: "List notification logs",
			description: "Retrieve recent notification delivery logs.",
			readOnly: true,
			inputSchema: {
				limit: z.number().int().min(1).max(500).optional().describe("Max rows to return (default 100)"),
			},
		},
		(args) => npmRequest("GET", `${BASE}/logs`, { query: { limit: args.limit as number | undefined } }),
	);
}
