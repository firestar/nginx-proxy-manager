import { z } from "zod";
import { toolRegistrar } from "../helpers.js";

const BASE = "/nginx/certificates";

export function registerCertificateTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx, "certificates");

	registerTool(
		"npm_list_certificates",
		{
			title: "List certificates",
			description: "List all SSL certificates.",
			readOnly: true,
			inputSchema: { expand: z.enum(["owner"]).optional() },
		},
		(args) => ctx.request("GET", BASE, { query: { expand: args.expand } }),
	);

	registerTool(
		"npm_get_certificate",
		{
			title: "Get certificate",
			description: "Get a single certificate by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_list_dns_providers",
		{
			title: "List DNS providers",
			description: "List the DNS providers available for DNS-challenge certificates.",
			readOnly: true,
		},
		() => ctx.request("GET", `${BASE}/dns-providers`),
	);

	registerTool(
		"npm_create_certificate",
		{
			title: "Create certificate",
			description:
				"Request or register an SSL certificate. Use provider 'letsencrypt' with domain_names to " +
				"issue a Let's Encrypt certificate, or 'other' to register an uploaded certificate.",
			inputSchema: {
				provider: z.enum(["letsencrypt", "other"]).describe("Certificate provider"),
				nice_name: z.string().optional().describe("Friendly display name"),
				domain_names: z
					.array(z.string().min(1))
					.optional()
					.describe("Domains to cover (required for letsencrypt)"),
				meta: z
					.record(z.unknown())
					.optional()
					.describe(
						"Provider options, e.g. { dns_challenge: false } or Let's Encrypt/DNS credentials",
					),
			},
		},
		(args) => ctx.request("POST", BASE, { body: args }),
	);

	registerTool(
		"npm_renew_certificate",
		{
			title: "Renew certificate",
			description: "Renew a Let's Encrypt certificate by id.",
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/renew`),
	);

	registerTool(
		"npm_delete_certificate",
		{
			title: "Delete certificate",
			description: "Permanently delete a certificate by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("DELETE", `${BASE}/${Number(args.id)}`),
	);
}
