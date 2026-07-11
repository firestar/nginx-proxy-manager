import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { getConfig } from "./config.js";
import { fetchKeyScopes, verifyConnection } from "./npm-client.js";
import { setKeyScopes } from "./scopes.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
	const config = getConfig();

	// Allow self-signed NPM certs when explicitly configured.
	if (!config.tlsRejectUnauthorized) {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	}

	// Fail fast with a clear message if NPM credentials are wrong/unreachable.
	try {
		await verifyConnection();
		console.error(`[npm-mcp] Connected to NPM API at ${config.baseUrl}`);
	} catch (err) {
		console.error(
			`[npm-mcp] Could not authenticate with NPM at ${config.baseUrl}: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
		process.exit(1);
	}
	// Scoped keys shrink the tool surface: out-of-scope tools are never
	// registered, so MCP clients don't see them. NPM still enforces scopes
	// on every request server-side.
	const scopes = await fetchKeyScopes();
	setKeyScopes(scopes);
	if (scopes) {
		console.error(`[npm-mcp] API key is scoped (${scopes.join(", ")}); out-of-scope tools are disabled`);
	}

	const app = express();
	app.use(express.json());

	// Optional bearer-token gate for the MCP endpoint.
	app.use("/mcp", (req: Request, res: Response, next) => {
		if (!config.authToken) {
			next();
			return;
		}
		const header = req.headers.authorization ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : "";
		if (token !== config.authToken) {
			res.status(401).json({
				jsonrpc: "2.0",
				error: { code: -32001, message: "Unauthorized" },
				id: null,
			});
			return;
		}
		next();
	});

	app.get("/healthz", (_req, res) => {
		res.json({ status: "ok" });
	});

	// One transport per session id, keyed on the mcp-session-id header.
	const transports: Record<string, StreamableHTTPServerTransport> = {};

	app.post("/mcp", async (req: Request, res: Response) => {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		let transport: StreamableHTTPServerTransport;

		if (sessionId && transports[sessionId]) {
			transport = transports[sessionId];
		} else if (!sessionId && isInitializeRequest(req.body)) {
			// New session: create a transport and connect a fresh server to it.
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (sid) => {
					transports[sid] = transport;
				},
			});
			transport.onclose = () => {
				if (transport.sessionId) {
					delete transports[transport.sessionId];
				}
			};
			const server = createMcpServer();
			await server.connect(transport);
		} else {
			res.status(400).json({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Bad Request: No valid session ID provided" },
				id: null,
			});
			return;
		}

		await transport.handleRequest(req, res, req.body);
	});

	// GET (SSE stream) and DELETE (session teardown) reuse an existing session.
	const handleSessionRequest = async (req: Request, res: Response) => {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send("Invalid or missing session ID");
			return;
		}
		await transports[sessionId].handleRequest(req, res);
	};

	app.get("/mcp", handleSessionRequest);
	app.delete("/mcp", handleSessionRequest);

	app.listen(config.port, config.host, () => {
		console.error(
			`[npm-mcp] Streamable HTTP MCP server listening on http://${config.host}:${config.port}/mcp`,
		);
	});
}

main().catch((err) => {
	console.error("[npm-mcp] Fatal error:", err);
	process.exit(1);
});
