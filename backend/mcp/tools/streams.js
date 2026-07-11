import { z } from "zod";
import { splitId, toolRegistrar } from "../helpers.js";

const BASE = "/nginx/streams";

const incomingPort = z.number().int().min(1).max(65535).describe("Port NPM listens on");
const forwardingHost = z.string().min(1).describe("Upstream host or IP to forward to");
const forwardingPort = z.number().int().min(1).max(65535).describe("Upstream port to forward to");

const optionalFields = {
	tcp_forwarding: z.boolean().optional().describe("Forward TCP traffic"),
	udp_forwarding: z.boolean().optional().describe("Forward UDP traffic"),
	certificate_id: z.number().int().optional().describe("Certificate id for TLS, or 0 for none"),
	domain_names: z.array(z.string().min(1)).optional(),
	tag_ids: z
		.array(z.number().int())
		.optional()
		.describe("IDs of tags to attach; replaces the existing set"),
	meta: z.record(z.unknown()).optional(),
};

export function registerStreamTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx, "streams");

	registerTool(
		"npm_list_streams",
		{
			title: "List streams",
			description: "List all TCP/UDP stream forwards.",
			readOnly: true,
			inputSchema: { expand: z.enum(["owner", "certificate", "tags"]).optional() },
		},
		(args) => ctx.request("GET", BASE, { query: { expand: args.expand } }),
	);

	registerTool(
		"npm_get_stream",
		{
			title: "Get stream",
			description: "Get a single stream by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_create_stream",
		{
			title: "Create stream",
			description: "Create a TCP/UDP stream forward from an incoming port to an upstream host/port.",
			inputSchema: {
				incoming_port: incomingPort,
				forwarding_host: forwardingHost,
				forwarding_port: forwardingPort,
				...optionalFields,
			},
		},
		(args) => ctx.request("POST", BASE, { body: args }),
	);

	registerTool(
		"npm_update_stream",
		{
			title: "Update stream",
			description: "Update fields on a stream. Only include fields you want to change.",
			inputSchema: {
				id: z.number().int(),
				incoming_port: incomingPort.optional(),
				forwarding_host: forwardingHost.optional(),
				forwarding_port: forwardingPort.optional(),
				...optionalFields,
			},
		},
		(args) => {
			const { id, body } = splitId(args);
			return ctx.request("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		"npm_delete_stream",
		{
			title: "Delete stream",
			description: "Permanently delete a stream by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("DELETE", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_enable_stream",
		{
			title: "Enable stream",
			description: "Enable a disabled stream.",
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/enable`),
	);

	registerTool(
		"npm_disable_stream",
		{
			title: "Disable stream",
			description: "Disable an active stream.",
			inputSchema: { id: z.number().int() },
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/disable`),
	);
}
