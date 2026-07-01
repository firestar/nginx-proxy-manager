import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { npmRequest } from "../npm-client.js";
import { registerTool, splitId } from "./helpers.js";

const BASE = "/nginx/dead-hosts";

const domainNames = z
	.array(z.string().min(1))
	.min(1)
	.describe("Domain names that should return a 404 page");

const optionalFields = {
	certificate_id: z.number().int().optional().describe("Certificate id for SSL, or 0 for none"),
	ssl_forced: z.boolean().optional(),
	hsts_enabled: z.boolean().optional(),
	hsts_subdomains: z.boolean().optional(),
	http2_support: z.boolean().optional(),
	advanced_config: z.string().optional(),
	meta: z.record(z.unknown()).optional(),
};

export function registerDeadHostTools(server: McpServer): void {
	registerTool(
		server,
		"npm_list_404_hosts",
		{
			title: "List 404 hosts",
			description: "List all 404 (dead) hosts.",
			readOnly: true,
			inputSchema: { expand: z.enum(["owner", "certificate"]).optional() },
		},
		(args) => npmRequest("GET", BASE, { query: { expand: args.expand as string | undefined } }),
	);

	registerTool(
		server,
		"npm_get_404_host",
		{
			title: "Get 404 host",
			description: "Get a single 404 host by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_create_404_host",
		{
			title: "Create 404 host",
			description: "Create a 404 host that serves a not-found page for the given domains.",
			inputSchema: { domain_names: domainNames, ...optionalFields },
		},
		(args) => npmRequest("POST", BASE, { body: args }),
	);

	registerTool(
		server,
		"npm_update_404_host",
		{
			title: "Update 404 host",
			description: "Update fields on a 404 host. Only include fields you want to change.",
			inputSchema: { id: z.number().int(), domain_names: domainNames.optional(), ...optionalFields },
		},
		(args) => {
			const { id, body } = splitId(args);
			return npmRequest("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		server,
		"npm_delete_404_host",
		{
			title: "Delete 404 host",
			description: "Permanently delete a 404 host by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("DELETE", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_enable_404_host",
		{
			title: "Enable 404 host",
			description: "Enable a disabled 404 host.",
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("POST", `${BASE}/${Number(args.id)}/enable`),
	);

	registerTool(
		server,
		"npm_disable_404_host",
		{
			title: "Disable 404 host",
			description: "Disable an active 404 host.",
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("POST", `${BASE}/${Number(args.id)}/disable`),
	);
}
