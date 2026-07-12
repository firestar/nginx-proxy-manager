import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBackupTools } from "./tools/backups.js";
import { registerAccessListTools } from "./tools/access-lists.js";
import { registerCertificateTools } from "./tools/certificates.js";
import { registerDeadHostTools } from "./tools/dead-hosts.js";
import { registerNodeTools } from "./tools/nodes.js";
import { registerMiscTools } from "./tools/misc.js";
import { registerProxyHostTools } from "./tools/proxy-hosts.js";
import { registerRedirectionHostTools } from "./tools/redirection-hosts.js";
import { registerStreamTools } from "./tools/streams.js";
import { registerTagTools } from "./tools/tags.js";

/**
 * Create a fresh MCP server instance with all NPM tools registered. A new
 * instance is created per Streamable HTTP session.
 */
export function createMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: "nginx-proxy-manager-mcp",
			version: "0.1.0",
		},
		{
			instructions:
				"Tools to manage an Nginx Proxy Manager instance: proxy hosts, redirection hosts, " +
				"404 hosts, TCP/UDP streams, SSL certificates and access lists. Prefix 'npm_'. " +
				"Create/update/delete tools change live configuration — confirm intent before destructive actions.",
		},
	);

	registerProxyHostTools(server);
	registerRedirectionHostTools(server);
	registerDeadHostTools(server);
	registerStreamTools(server);
	registerCertificateTools(server);
	registerAccessListTools(server);
	registerTagTools(server);
	registerNodeTools(server);
	registerBackupTools(server);
	registerMiscTools(server);

	return server;
}
