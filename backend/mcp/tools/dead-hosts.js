import { z } from "zod";
import { splitId, toolRegistrar } from "../helpers.js";

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
	tag_ids: z
		.array(z.number().int())
		.optional()
		.describe("IDs of tags to attach; replaces the existing set"),
	meta: z.record(z.unknown()).optional(),
};

export function registerDeadHostTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx, "dead_hosts");

	registerTool(
		"npm_list_404_hosts",
		{
			title: "List 404 hosts",
			description: "List all 404 (dead) hosts.",
			readOnly: true,
			inputSchema: { expand: z.enum(["owner", "certificate", "tags"]).optional() },
		},
		(args) => ctx.request("GET", BASE, { query: { expand: args.expand } }),
	);

	registerTool(
		"npm_get_404_host",
		{
			title: "Get 404 host",
			description: "Get a single 404 host by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_create_404_host",
		{
			title: "Create 404 host",
			description: "Create a 404 host that serves a not-found page for the given domains.",
			inputSchema: { domain_names: domainNames, ...optionalFields },
		},
		(args) => ctx.request("POST", BASE, { body: args }),
	);

	registerTool(
		"npm_update_404_host",
		{
			title: "Update 404 host",
			description: "Update fields on a 404 host. Only include fields you want to change.",
			inputSchema: { id: z.number().int(), domain_names: domainNames.optional(), ...optionalFields },
		},
		(args) => {
			const { id, body } = splitId(args);
			return ctx.request("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		"npm_delete_404_host",
		{
			title: "Delete 404 host",
			description: "Permanently delete a 404 host by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("DELETE", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_enable_404_host",
		{
			title: "Enable 404 host",
			description: "Enable a disabled 404 host.",
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/enable`),
	);

	registerTool(
		"npm_disable_404_host",
		{
			title: "Disable 404 host",
			description: "Disable an active 404 host.",
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/disable`),
	);
}
