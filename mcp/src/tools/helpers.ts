import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import { NpmApiError } from "../npm-client.js";
import { getKeyScopes, scopeAllows } from "../scopes.js";

export interface ToolConfig {
	title: string;
	description: string;
	inputSchema?: ZodRawShape;
	/** True for tools that only read data (no side effects). */
	readOnly?: boolean;
	/** True for tools that delete or otherwise irreversibly change data. */
	destructive?: boolean;
	/**
	 * Scope resource this tool belongs to (e.g. "proxy_hosts"). Read-only
	 * tools need `resource:view`, everything else `resource:manage`. Tools
	 * without a resource are always registered.
	 */
	resource?: string;
}

type Handler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

function toTextResult(data: unknown) {
	const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
	return { content: [{ type: "text" as const, text }] };
}

/**
 * Register a tool with consistent annotations and error handling. Any thrown
 * error (including NPM API errors) is converted into an `isError` tool result
 * with a readable message rather than crashing the transport.
 */
export function registerTool(
	server: McpServer,
	name: string,
	config: ToolConfig,
	handler: Handler,
): void {
	// Skip tools the API key's scopes don't allow — the model never sees them.
	// The NPM backend still enforces scopes server-side on every request.
	if (config.resource) {
		const required = `${config.resource}:${config.readOnly ? "view" : "manage"}`;
		if (!scopeAllows(getKeyScopes(), required)) {
			return;
		}
	}
	server.registerTool(
		name,
		{
			title: config.title,
			description: config.description,
			inputSchema: config.inputSchema ?? {},
			annotations: {
				title: config.title,
				readOnlyHint: config.readOnly ?? false,
				destructiveHint: config.destructive ?? false,
			},
		},
		// The generic wrapper loses the SDK's inferred arg typing; cast is safe
		// because every handler treats args as a plain record.
		(async (args: Record<string, unknown>) => {
			try {
				const result = await handler(args ?? {});
				return toTextResult(result);
			} catch (err) {
				let message: string;
				if (err instanceof NpmApiError) {
					const details = err.body ? `\n\nDetails: ${JSON.stringify(err.body)}` : "";
					message = `${err.message}${details}`;
				} else if (err instanceof Error) {
					message = err.message;
				} else {
					message = String(err);
				}
				return {
					content: [{ type: "text" as const, text: `Error: ${message}` }],
					isError: true,
				};
			}
			// biome-ignore lint/suspicious/noExplicitAny: SDK handler signature bridge
		}) as any,
	);
}
/**
 * A registerTool bound to one scope resource, so tool files can gate a whole
 * group without repeating the resource on every call.
 */
export function scopedRegistrar(resource: string) {
	return (server: McpServer, name: string, config: ToolConfig, handler: Handler): void =>
		registerTool(server, name, { ...config, resource }, handler);
}

/** Pull `id` out of an args object and return the remaining fields as a body. */
export function splitId(args: Record<string, unknown>): { id: number; body: Record<string, unknown> } {
	const { id, ...body } = args;
	return { id: Number(id), body };
}
