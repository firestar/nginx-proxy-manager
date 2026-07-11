import { NpmApiError } from "./client.js";
import { scopeAllows } from "./scopes.js";

const toTextResult = (data) => {
	const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
	return { content: [{ type: "text", text }] };
};

/**
 * Returns a registerTool function bound to one MCP server instance, the
 * caller's context and a scope resource. Tools the caller's key scopes
 * don't allow are silently skipped (read-only tools need `resource:view`,
 * everything else `resource:manage`; a null resource is never gated).
 * Thrown errors become `isError` tool results instead of crashing the
 * transport.
 *
 * @param   {McpServer} server
 * @param   {Object}    ctx       from createApiContext()
 * @param   {String}    [resource]
 * @returns {Function}  (name, config, handler) => void
 */
const toolRegistrar = (server, ctx, resource) => {
	return (name, config, handler) => {
		if (resource) {
			const required = `${resource}:${config.readOnly ? "view" : "manage"}`;
			if (!scopeAllows(ctx.scopes, required)) {
				return;
			}
		}

		server.registerTool(
			name,
			{
				title: config.title,
				description: config.description,
				inputSchema: config.inputSchema || {},
				annotations: {
					title: config.title,
					readOnlyHint: config.readOnly || false,
					destructiveHint: config.destructive || false,
				},
			},
			async (args) => {
				try {
					const result = await handler(args || {});
					return toTextResult(result);
				} catch (err) {
					let message;
					if (err instanceof NpmApiError) {
						const details = err.body ? `\n\nDetails: ${JSON.stringify(err.body)}` : "";
						message = `${err.message}${details}`;
					} else if (err instanceof Error) {
						message = err.message;
					} else {
						message = String(err);
					}
					return {
						content: [{ type: "text", text: `Error: ${message}` }],
						isError: true,
					};
				}
			},
		);
	};
};

/** Pull `id` out of an args object and return the remaining fields as a body. */
const splitId = (args) => {
	const { id, ...body } = args;
	return { id: Number(id), body };
};

export { toolRegistrar, splitId };
