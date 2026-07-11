import { z } from "zod";
import { splitId, toolRegistrar } from "../helpers.js";

const BASE = "/nginx/proxy-hosts";

const domainNames = z
	.array(z.string().min(1))
	.min(1)
	.describe("Domain names served by this host, e.g. ['app.example.com']");
const forwardScheme = z.enum(["http", "https"]).describe("Scheme used to reach the upstream");
const forwardHost = z.string().min(1).describe("Upstream host or IP, e.g. '127.0.0.1'");
const forwardPort = z.number().int().min(1).max(65535).describe("Upstream port");

const location = z.object({
	path: z.string().min(1).describe("Location path, e.g. '/api'"),
	forward_scheme: forwardScheme,
	forward_host: forwardHost,
	forward_port: forwardPort,
	forward_path: z.string().optional(),
	advanced_config: z.string().optional(),
});

// Optional fields shared by create and update.
const optionalFields = {
	certificate_id: z
		.number()
		.int()
		.optional()
		.describe("Certificate id to use for SSL, or 0 for none"),
	ssl_forced: z.boolean().optional().describe("Force redirect HTTP to HTTPS"),
	hsts_enabled: z.boolean().optional(),
	hsts_subdomains: z.boolean().optional(),
	http2_support: z.boolean().optional(),
	block_exploits: z.boolean().optional(),
	caching_enabled: z.boolean().optional(),
	allow_websocket_upgrade: z.boolean().optional().describe("Allow websocket upgrades on all paths"),
	trust_forwarded_proto: z.boolean().optional(),
	access_list_id: z.number().int().optional().describe("Access list id to attach, or 0 for none"),
	advanced_config: z.string().optional().describe("Raw nginx config snippet"),
	enabled: z.boolean().optional(),
	locations: z.array(location).optional().describe("Custom per-path forwarding locations"),
	tag_ids: z
		.array(z.number().int())
		.optional()
		.describe("IDs of tags to attach; replaces the existing set"),
	meta: z.record(z.unknown()).optional(),
};

export function registerProxyHostTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx, "proxy_hosts");

	registerTool(
		"npm_list_proxy_hosts",
		{
			title: "List proxy hosts",
			description: "List all proxy hosts configured in Nginx Proxy Manager.",
			readOnly: true,
			inputSchema: {
				expand: z
					.enum(["access_list", "owner", "certificate", "tags"])
					.optional()
					.describe("Optionally expand a related object"),
			},
		},
		(args) => ctx.request("GET", BASE, { query: { expand: args.expand } }),
	);

	registerTool(
		"npm_get_proxy_host",
		{
			title: "Get proxy host",
			description: "Get a single proxy host by id.",
			readOnly: true,
			inputSchema: { id: z.number().int().describe("Proxy host id") },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_create_proxy_host",
		{
			title: "Create proxy host",
			description: "Create a new proxy host that forwards a domain to an upstream server.",
			inputSchema: {
				domain_names: domainNames,
				forward_scheme: forwardScheme,
				forward_host: forwardHost,
				forward_port: forwardPort,
				...optionalFields,
			},
		},
		(args) => ctx.request("POST", BASE, { body: args }),
	);

	registerTool(
		"npm_update_proxy_host",
		{
			title: "Update proxy host",
			description: "Update fields on an existing proxy host. Only include fields you want to change.",
			inputSchema: {
				id: z.number().int().describe("Proxy host id"),
				domain_names: domainNames.optional(),
				forward_scheme: forwardScheme.optional(),
				forward_host: forwardHost.optional(),
				forward_port: forwardPort.optional(),
				...optionalFields,
			},
		},
		(args) => {
			const { id, body } = splitId(args);
			return ctx.request("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		"npm_delete_proxy_host",
		{
			title: "Delete proxy host",
			description: "Permanently delete a proxy host by id.",
			destructive: true,
			inputSchema: { id: z.number().int().describe("Proxy host id") },
		},
		(args) => ctx.request("DELETE", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_enable_proxy_host",
		{
			title: "Enable proxy host",
			description: "Enable a previously disabled proxy host.",
			inputSchema: { id: z.number().int().describe("Proxy host id") },
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/enable`),
	);

	registerTool(
		"npm_disable_proxy_host",
		{
			title: "Disable proxy host",
			description: "Disable an active proxy host without deleting it.",
			inputSchema: { id: z.number().int().describe("Proxy host id") },
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/disable`),
	);
}
