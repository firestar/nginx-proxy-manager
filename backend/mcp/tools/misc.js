import { z } from "zod";
import { toolRegistrar } from "../helpers.js";

/**
 * Read-only supporting tools: users, settings, audit log and reports.
 * These do not modify anything.
 */
export function registerMiscTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx);

	registerTool(
		"npm_get_current_user",
		{
			title: "Get current user",
			description: "Get the user the MCP server is authenticated as (via /users/me).",
			readOnly: true,
			inputSchema: {
				expand: z
					.enum(["permissions"])
					.optional()
					.describe("Optionally expand the user's permissions"),
			},
		},
		(args) => ctx.request("GET", "/users/me", { query: { expand: args.expand } }),
	);

	registerTool(
		"npm_list_users",
		{
			title: "List users",
			description: "List all NPM users (admin only).",
			readOnly: true,
			inputSchema: {
				expand: z
					.enum(["permissions"])
					.optional()
					.describe("Optionally expand each user's permissions"),
				query: z.string().optional().describe("Optional search query"),
			},
		},
		(args) =>
			ctx.request("GET", "/users", {
				query: {
					expand: args.expand,
					query: args.query,
				},
			}),
	);

	registerTool(
		"npm_get_user",
		{
			title: "Get user",
			description: "Get a single user by id.",
			readOnly: true,
			inputSchema: {
				id: z.number().int(),
				expand: z.enum(["permissions"]).optional(),
			},
		},
		(args) =>
			ctx.request("GET", `/users/${Number(args.id)}`, {
				query: { expand: args.expand },
			}),
	);

	registerTool(
		"npm_list_settings",
		{
			title: "List settings",
			description: "List all NPM settings.",
			readOnly: true,
		},
		() => ctx.request("GET", "/settings"),
	);

	registerTool(
		"npm_get_setting",
		{
			title: "Get setting",
			description: "Get a single setting by its id (e.g. 'default-site').",
			readOnly: true,
			inputSchema: { id: z.string().min(1).describe("Setting id") },
		},
		(args) => ctx.request("GET", `/settings/${encodeURIComponent(String(args.id))}`),
	);

	registerTool(
		"npm_get_audit_log",
		{
			title: "Get audit log",
			description: "Get the audit log of recent changes.",
			readOnly: true,
			inputSchema: { query: z.string().optional().describe("Optional search query") },
		},
		(args) => ctx.request("GET", "/audit-log", { query: { query: args.query } }),
	);

	registerTool(
		"npm_get_hosts_report",
		{
			title: "Get hosts report",
			description: "Get a summary report of host counts by type.",
			readOnly: true,
		},
		() => ctx.request("GET", "/reports/hosts"),
	);
}
