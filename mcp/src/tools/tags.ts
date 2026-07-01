import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { npmRequest } from "../npm-client.js";
import { registerTool, splitId } from "./helpers.js";

const BASE = "/nginx/tags";

const name = z.string().min(1).max(100).describe("Tag name, e.g. 'Production'");
const color = z.string().max(32).optional().describe("Optional hex color, e.g. '#206bc4'");

export function registerTagTools(server: McpServer): void {
	registerTool(
		server,
		"npm_list_tags",
		{
			title: "List tags",
			description: "List all tags used to organize hosts.",
			readOnly: true,
			inputSchema: {
				expand: z.enum(["owner"]).optional(),
				query: z.string().optional().describe("Optional search query"),
			},
		},
		(args) =>
			npmRequest("GET", BASE, {
				query: {
					expand: args.expand as string | undefined,
					query: args.query as string | undefined,
				},
			}),
	);

	registerTool(
		server,
		"npm_get_tag",
		{
			title: "Get tag",
			description: "Get a single tag by id.",
			readOnly: true,
			inputSchema: { id: z.number().int().describe("Tag id") },
		},
		(args) => npmRequest("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		server,
		"npm_create_tag",
		{
			title: "Create tag",
			description: "Create a tag that can be attached to proxy hosts, redirections, streams and 404 hosts.",
			inputSchema: { name, color, meta: z.record(z.unknown()).optional() },
		},
		(args) => npmRequest("POST", BASE, { body: args }),
	);

	registerTool(
		server,
		"npm_update_tag",
		{
			title: "Update tag",
			description: "Update a tag's name or color. Only include fields you want to change.",
			inputSchema: {
				id: z.number().int().describe("Tag id"),
				name: name.optional(),
				color,
				meta: z.record(z.unknown()).optional(),
			},
		},
		(args) => {
			const { id, body } = splitId(args);
			return npmRequest("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		server,
		"npm_delete_tag",
		{
			title: "Delete tag",
			description: "Permanently delete a tag by id. It is removed from any hosts it was attached to.",
			destructive: true,
			inputSchema: { id: z.number().int().describe("Tag id") },
		},
		(args) => npmRequest("DELETE", `${BASE}/${Number(args.id)}`),
	);
}
