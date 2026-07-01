import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { npmRequest } from "../npm-client.js";
import { registerTool, splitId } from "./helpers.js";

const BASE = "/nginx/redirection-hosts";

const domainNames = z
	.array(z.string().min(1))
	.min(1)
	.describe("Domain names that will be redirected, e.g. ['old.example.com']");
const forwardScheme = z
	.enum(["auto", "http", "https"])
	.describe("Scheme for the redirect target ('auto' keeps the request scheme)");
const forwardHttpCode = z
	.number()
	.int()
	.min(300)
	.max(308)
	.describe("HTTP redirect status code, e.g. 301 or 302");
const forwardDomainName = z.string().min(1).describe("Destination domain to redirect to");

const optionalFields = {
	preserve_path: z.boolean().optional().describe("Append the original path to the destination"),
	certificate_id: z.number().int().optional().describe("Certificate id for SSL, or 0 for none"),
	ssl_forced: z.boolean().optional(),
	hsts_enabled: z.boolean().optional(),
	hsts_subdomains: z.boolean().optional(),
	http2_support: z.boolean().optional(),
	block_exploits: z.boolean().optional(),
	advanced_config: z.string().optional(),
	meta: z.record(z.unknown()).optional(),
};

export function registerRedirectionHostTools(server: McpServer): void {
	registerTool(
		server,
		"npm_list_redirection_hosts",
		{
			title: "List redirection hosts",
			description: "List all redirection hosts.",
			readOnly: true,
			inputSchema: {
				expand: z.enum(["owner", "certificate"]).optional(),
			},
		},
		(args) => npmRequest("GET", BASE, { query: { expand: args.expand as string | undefined } }),
	);

	registerTool(
		server,
		"npm_get_redirection_host",
		{
			title: "Get redirection host",
			description: "Get a single redirection host by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_create_redirection_host",
		{
			title: "Create redirection host",
			description: "Create a redirection host that redirects one or more domains to another domain.",
			inputSchema: {
				domain_names: domainNames,
				forward_scheme: forwardScheme,
				forward_http_code: forwardHttpCode,
				forward_domain_name: forwardDomainName,
				...optionalFields,
			},
		},
		(args) => npmRequest("POST", BASE, { body: args }),
	);

	registerTool(
		server,
		"npm_update_redirection_host",
		{
			title: "Update redirection host",
			description: "Update fields on a redirection host. Only include fields you want to change.",
			inputSchema: {
				id: z.number().int(),
				domain_names: domainNames.optional(),
				forward_scheme: forwardScheme.optional(),
				forward_http_code: forwardHttpCode.optional(),
				forward_domain_name: forwardDomainName.optional(),
				...optionalFields,
			},
		},
		(args) => {
			const { id, body } = splitId(args);
			return npmRequest("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		server,
		"npm_delete_redirection_host",
		{
			title: "Delete redirection host",
			description: "Permanently delete a redirection host by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("DELETE", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_enable_redirection_host",
		{
			title: "Enable redirection host",
			description: "Enable a disabled redirection host.",
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("POST", `${BASE}/${Number(args.id)}/enable`),
	);

	registerTool(
		server,
		"npm_disable_redirection_host",
		{
			title: "Disable redirection host",
			description: "Disable an active redirection host.",
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("POST", `${BASE}/${Number(args.id)}/disable`),
	);
}
