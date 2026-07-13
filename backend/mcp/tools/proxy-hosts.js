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


const headerItem = z.object({
	direction: z.enum(["request", "response"]).describe("Whether to manipulate the request or response header"),
	action: z.enum(["set", "remove"]).describe('"set" injects/overwrites the header; "remove" suppresses it'),
	name: z.string().min(1).describe("Header name, e.g. X-Custom-Header"),
	value: z.string().optional().describe("Header value (required when action is \"set\")"),
});

const upstreamItem = z.object({
	host: z.string().min(1).describe("Upstream host or IP, e.g. '10.0.0.2'"),
	port: z.number().int().min(1).max(65535).describe("Upstream port"),
	weight: z.number().int().min(1).optional().describe("Relative weight for round-robin/least_conn distribution (default 1)"),
	max_fails: z.number().int().min(0).optional().describe("Passive health: failed attempts within fail_timeout before the server is marked unavailable"),
	fail_timeout: z.number().int().min(1).optional().describe("Passive health: seconds a server stays unavailable after max_fails is reached"),
	backup: z.boolean().optional().describe("Only receives traffic when all non-backup servers are unavailable"),
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
	headers: z
		.array(headerItem)
		.optional()
		.describe("Custom request/response header manipulations"),
	upstreams: z
		.array(upstreamItem)
		.min(1)
		.nullable()
		.optional()
		.describe(
			"Load-balancing upstream pool (Phase A: static nginx load balancing with passive health via max_fails/fail_timeout). Requires >=1 entry and >=1 non-backup entry; host:port pairs must be unique. null or omitted = single-target mode using forward_host/forward_port. Active probe-driven failover is a planned follow-up, not part of Phase A.",
		),
	balance_method: z
		.enum(["least_conn", "ip_hash"])
		.nullable()
		.optional()
		.describe("Load-balancing method for the upstream pool; null or omitted = nginx default round-robin"),
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
		"npm_get_proxy_host_config",
		{
			title: "Get proxy host nginx config",
			description: "Get the rendered nginx config text for a saved proxy host without applying it.",
			inputSchema: { id: z.number().int().describe("Proxy host id") },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}/config`),
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

	registerTool(
		"npm_set_maintenance",
		{
			title: "Set proxy host maintenance mode",
			description: "Enable or disable maintenance mode on a proxy host. When enabled, the host serves a 503 page over valid TLS; cert renewal is unaffected.",
			inputSchema: {
				id: z.number().int().describe("Proxy host id"),
				enabled: z.boolean().describe("true to enable maintenance mode, false to disable"),
			},
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/maintenance`, { body: { enabled: args.enabled } }),
	);

	registerTool(
		"npm_get_maintenance_page",
		{
			title: "Get proxy host maintenance page HTML",
			description: "Get the custom HTML for a proxy host's 503 maintenance page. Empty string means the built-in branded page is used.",
			readOnly: true,
			inputSchema: { id: z.number().int().describe("Proxy host id") },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}/maintenance-page`),
	);

	registerTool(
		"npm_set_maintenance_page",
		{
			title: "Set proxy host maintenance page HTML",
			description: "Set custom HTML for a proxy host's 503 maintenance page. Pass empty string to revert to the built-in branded page.",
			inputSchema: {
				id: z.number().int().describe("Proxy host id"),
				html: z.string().describe("Custom HTML content; empty string reverts to the built-in page"),
			},
		},
		(args) => ctx.request("PUT", `${BASE}/${Number(args.id)}/maintenance-page`, { body: { html: args.html } }),
	);

	registerTool(
		"npm_get_proxy_host_metrics",
		{
			title: "Get proxy host metrics",
			description: "Get traffic metrics (requests, bandwidth, status codes) for a single proxy host over a time range.",
			readOnly: true,
			inputSchema: {
				id: z.number().int().describe("Proxy host id"),
				range: z.enum(["1h", "24h", "7d", "30d"]).default("24h").describe("Time range"),
			},
		},
		(args) => ctx.request("GET", `/reports/proxy-hosts/${Number(args.id)}/metrics`, { query: { range: args.range } }),
	);

	registerTool(
		"npm_get_metrics_overview",
		{
			title: "Get metrics overview",
			description: "Get aggregate traffic metrics across all visible proxy hosts plus a per-host breakdown, over a time range.",
			readOnly: true,
			inputSchema: {
				range: z.enum(["1h", "24h", "7d", "30d"]).default("24h").describe("Time range"),
			},
		},
		(args) => ctx.request("GET", "/reports/proxy-hosts/metrics", { query: { range: args.range } }),
	);

	registerTool(
		"npm_get_proxy_host_config",
		{
			title: "Get proxy host nginx config",
			description: "Get the rendered nginx configuration for a proxy host.",
			readOnly: true,
			inputSchema: { id: z.number().int().describe("Proxy host id") },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}/config`),
	);

	registerTool(
		"npm_test_proxy_host_config",
		{
			title: "Test proxy host nginx config",
			description: "Dry-run nginx -t for a proxy host config. Pass an existing id to test the saved config, or include host fields to pre-validate before saving. Returns { ok, errors? }.",
			inputSchema: {
				id: z.number().int().optional().describe("Existing proxy host id to base the test on; omit for a new host"),
				domain_names: domainNames.optional(),
				forward_scheme: forwardScheme.optional(),
				forward_host: forwardHost.optional(),
				forward_port: forwardPort.optional(),
				advanced_config: z.string().optional(),
			},
		},
		(args) => ctx.request("POST", `${BASE}/test-config`, { body: args }),
	);
}
