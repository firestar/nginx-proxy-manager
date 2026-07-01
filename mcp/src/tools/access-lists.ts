import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { npmRequest } from "../npm-client.js";
import { registerTool, splitId } from "./helpers.js";

const BASE = "/nginx/access-lists";

const items = z
	.array(
		z.object({
			username: z.string().min(1),
			password: z.string(),
		}),
	)
	.optional()
	.describe("HTTP basic-auth username/password pairs");

const clients = z
	.array(
		z.object({
			address: z.string().min(1).describe("IP or CIDR, e.g. '192.168.0.0/24'"),
			directive: z.enum(["allow", "deny"]),
		}),
	)
	.optional()
	.describe("IP allow/deny rules");

const optionalFields = {
	satisfy_any: z
		.boolean()
		.optional()
		.describe("If true, satisfying any rule grants access; if false, all must be satisfied"),
	pass_auth: z.boolean().optional().describe("Pass the Authorization header to the upstream"),
	items,
	clients,
};

export function registerAccessListTools(server: McpServer): void {
	registerTool(
		server,
		"npm_list_access_lists",
		{
			title: "List access lists",
			description: "List all access lists.",
			readOnly: true,
			inputSchema: {
				expand: z.enum(["owner", "items", "clients", "proxy_hosts"]).optional(),
			},
		},
		(args) => npmRequest("GET", BASE, { query: { expand: args.expand as string | undefined } }),
	);

	registerTool(
		server,
		"npm_get_access_list",
		{
			title: "Get access list",
			description: "Get a single access list by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_create_access_list",
		{
			title: "Create access list",
			description: "Create an access list with optional HTTP basic-auth users and IP allow/deny rules.",
			inputSchema: { name: z.string().min(1).describe("Access list name"), ...optionalFields },
		},
		(args) => npmRequest("POST", BASE, { body: args }),
	);

	registerTool(
		server,
		"npm_update_access_list",
		{
			title: "Update access list",
			description:
				"Update an access list. Note: items and clients replace the existing sets, so include the full desired list.",
			inputSchema: { id: z.number().int(), name: z.string().min(1).optional(), ...optionalFields },
		},
		(args) => {
			const { id, body } = splitId(args);
			return npmRequest("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		server,
		"npm_delete_access_list",
		{
			title: "Delete access list",
			description: "Permanently delete an access list by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("DELETE", `${BASE}/${Number(args.id)}`),
	);
}
