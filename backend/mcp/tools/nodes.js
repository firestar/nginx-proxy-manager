import { z } from "zod";
import { toolRegistrar } from "../helpers.js";

const BASE = "/nodes";

export function registerNodeTools(server, ctx) {
	const registerTool = toolRegistrar(server, ctx, "nodes");

	registerTool(
		"npm_list_nodes",
		{
			title: "List nodes",
			description:
				"List remote nginx nodes enrolled with this panel: name, status (pending/online/offline), " +
				"last_seen, agent version, config_version and whether an agent is connected right now. " +
				"Hosts with a node_id are served by that node instead of the panel's local nginx.",
			readOnly: true,
			inputSchema: {},
		},
		() => ctx.request("GET", BASE),
	);

	registerTool(
		"npm_get_node",
		{
			title: "Get node",
			description:
				"Get one remote node by id, including status, last_seen, agent version, config_version and " +
				"meta (last config apply error, applied version).",
			readOnly: true,
			inputSchema: {
				id: z.number().int().positive().describe("Node ID"),
			},
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}`),
	);

	registerTool(
		"npm_sync_node",
		{
			title: "Force sync node",
			description:
				"Trigger an immediate config push to a remote node. The panel schedules the push and returns; " +
				"the node will ack asynchronously. Use npm_get_node_apply_log to check the result.",
			readOnly: false,
			inputSchema: {
				id: z.number().int().positive().describe("Node ID"),
			},
		},
		(args) => ctx.request("POST", `${BASE}/${Number(args.id)}/sync`),
	);

	registerTool(
		"npm_get_node_apply_log",
		{
			title: "Get node apply log",
			description:
				"Get the most recent config apply log entries for a node — version, ok/error, timestamp. " +
				"Entries are recorded each time the node\'s agent acks a pushed config.",
			readOnly: true,
			inputSchema: {
				id: z.number().int().positive().describe("Node ID"),
				limit: z.number().int().min(1).max(200).optional().describe("Max entries (default 50)"),
			},
		},
		(args) => ctx.request("GET", `${BASE}/${Number(args.id)}/apply-log`, {
				query: args.limit ? { limit: args.limit } : undefined,
			}),
	);
}
