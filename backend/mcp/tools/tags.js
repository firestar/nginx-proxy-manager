import { z } from "zod";
import { splitId, toolRegistrar } from "../helpers.js";

const BASE = "/nginx/tags";

const name = z.string().min(1).max(100).describe("Tag name, e.g. 'Production'");
const color = z.string().max(32).optional().describe("Optional hex color, e.g. '#206bc4'");
const icon = z.string().max(50).optional().describe("Optional Tabler icon name, e.g. 'server'");

export function registerTagTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx);

	registerTool(
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
			ctx.request("GET", BASE, {
				query: {
					expand: args.expand,
					query: args.query,
				},
			}),
	);

	registerTool(
		"npm_get_tag",
		{
			title: "Get tag",
			description: "Get a single tag by id.",
			readOnly: true,
			inputSchema: { id: z.number().int().describe("Tag id") },
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_create_tag",
		{
			title: "Create tag",
			description: "Create a tag that can be attached to proxy hosts, redirections, streams and 404 hosts.",
			inputSchema: { name, color, icon, meta: z.record(z.unknown()).optional() },
		},
		(args) => ctx.request("POST", BASE, { body: args }),
	);

	registerTool(
		"npm_update_tag",
		{
			title: "Update tag",
			description: "Update a tag's name, color or icon. Only include fields you want to change.",
			inputSchema: {
				id: z.number().int().describe("Tag id"),
				name: name.optional(),
				color,
				icon,
				meta: z.record(z.unknown()).optional(),
			},
		},
		(args) => {
			const { id, body } = splitId(args);
			return ctx.request("PUT", `${BASE}/${id}`, { body });
		},
	);

	registerTool(
		"npm_delete_tag",
		{
			title: "Delete tag",
			description: "Permanently delete a tag by id. It is removed from any hosts it was attached to.",
			destructive: true,
			inputSchema: { id: z.number().int().describe("Tag id") },
		},
		(args) => ctx.request("DELETE", `${BASE}/${Number(args.id)}`),
	);
}
