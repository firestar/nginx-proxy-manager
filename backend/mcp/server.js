import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccessListTools } from "./tools/access-lists.js";
import { registerCertificateTools } from "./tools/certificates.js";
import { registerDeadHostTools } from "./tools/dead-hosts.js";
import { registerMiscTools } from "./tools/misc.js";
import { registerProxyHostTools } from "./tools/proxy-hosts.js";
import { registerRedirectionHostTools } from "./tools/redirection-hosts.js";
import { registerStreamTools } from "./tools/streams.js";
import { registerTagTools } from "./tools/tags.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerUptimeTools } from "./tools/uptime.js";
import { registerBackupTools } from "./tools/backups.js";
import { registerNodeTools } from "./tools/nodes.js";

/**
 * Create a fresh MCP server instance for one Streamable HTTP session. Tools
 * outside the caller's API key scopes are not registered; every tool call is
 * replayed against the local API with the caller's own bearer token.
 *
 * @param   {Object} ctx  from createApiContext()
 * @returns {McpServer}
 */
const createMcpServer = (ctx) => {
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

	registerProxyHostTools(server, ctx);
	registerRedirectionHostTools(server, ctx);
	registerDeadHostTools(server, ctx);
	registerStreamTools(server, ctx);
	registerCertificateTools(server, ctx);
	registerAccessListTools(server, ctx);
	registerTagTools(server, ctx);
	registerMiscTools(server, ctx);
	registerNotificationTools(server, ctx);
	registerUptimeTools(server, ctx);
	registerBackupTools(server, ctx);
	registerNodeTools(server, ctx);
};

export { createMcpServer };
