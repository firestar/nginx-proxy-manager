import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { npmRequest } from "../npm-client.js";
import { scopedRegistrar } from "./helpers.js";

// Gate every tool in this file behind the key's nodes scope.
const registerTool = scopedRegistrar("nodes");

const BASE = "/nodes";

export function registerNodeTools(server: McpServer): void {
	registerTool(
		server,
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
		() => npmRequest("GET", BASE),
	);

	registerTool(
		server,
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
		(args) => npmRequest("GET", `${BASE}/${Number(args.id)}`),
	);
}
