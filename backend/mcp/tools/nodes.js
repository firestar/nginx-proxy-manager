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
}
