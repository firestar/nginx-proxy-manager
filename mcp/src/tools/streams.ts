import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { npmRequest } from "../npm-client.js";
import { registerTool, splitId } from "./helpers.js";

const BASE = "/nginx/streams";

const incomingPort = z.number().int().min(1).max(65535).describe("Port NPM listens on");
const forwardingHost = z.string().min(1).describe("Upstream host or IP to forward to");
const forwardingPort = z.number().int().min(1).max(65535).describe("Upstream port to forward to");

const optionalFields = {
	tcp_forwarding: z.boolean().optional().describe("Forward TCP traffic"),
	udp_forwarding: z.boolean().optional().describe("Forward UDP traffic"),
	certificate_id: z.number().int().optional().describe("Certificate id for TLS, or 0 for none"),
	domain_names: z.array(z.string().min(1)).optional(),
	meta: z.record(z.unknown()).optional(),
};

export function registerStreamTools(server: McpServer): void {
	registerTool(
		server,
		"npm_list_streams",
		{
			title: "List streams",
			description: "List all TCP/UDP stream forwards.",
			readOnly: true,
			inputSchema: { expand: z.enum(["owner", "certificate"]).optional() },
		},
		(args) => npmRequest("GET", BASE, { query: { expand: args.expand as string | undefined } }),
	);

	registerTool(
		server,
		"npm_get_stream",
		{
			title: "Get stream",
			description: "Get a single stream by id.",
			readOnly: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
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
		(args) => npmRequest("POST", BASE, { body: args }),
	);

	registerTool(
		server,
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
			return npmRequest("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		server,
		"npm_delete_stream",
		{
			title: "Delete stream",
			description: "Permanently delete a stream by id.",
			destructive: true,
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("DELETE", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_enable_stream",
		{
			title: "Enable stream",
			description: "Enable a disabled stream.",
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("POST", `${BASE}/${Number(args.id)}/enable`),
	);

	registerTool(
		server,
		"npm_disable_stream",
		{
			title: "Disable stream",
			description: "Disable an active stream.",
			inputSchema: { id: z.number().int() },
		},
		(args) => npmRequest("POST", `${BASE}/${Number(args.id)}/disable`),
	);
}
