import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import Access from "../lib/access.js";
import errs from "../lib/error.js";
import { express as logger } from "../logger.js";
import { createApiContext } from "../mcp/client.js";
import { createMcpServer } from "../mcp/server.js";
import apiKeyModel from "../models/api_key.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// One transport per MCP session, keyed on the mcp-session-id header. Each
// session is pinned to the token that initialized it so a session id cannot
// be replayed with different (or no) credentials.
const sessions = {};

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Validate the bearer and return the API key scopes (null = unrestricted or
 * JWT auth). Throws AuthError/PermissionError on a bad token.
 */
const authenticate = async (token) => {
	if (!token) {
		throw new errs.PermissionError("Permission Denied");
	}
	const access = new Access(token);
	await access.load();

	if (token.startsWith("npm_")) {
		const keyId = access.token.get("attrs").api_key_id;
		const row = await apiKeyModel.query().where("id", keyId).andWhere("is_deleted", 0).first();
		return Array.isArray(row?.scopes) && row.scopes.length ? row.scopes : null;
	}
	return null;
};

const jsonRpcError = (res, status, message) => {
	res.status(status).json({
		jsonrpc: "2.0",
		error: { code: -32001, message },
		id: null,
	});
};

/** Look up the session for this request and enforce the token pin. */
const getSession = (req, res) => {
	const sessionId = req.headers["mcp-session-id"];
	const session = sessionId ? sessions[sessionId] : undefined;
	if (!session) {
		jsonRpcError(res, 404, "Unknown or expired MCP session");
		return null;
	}
	if (!res.locals.token || hashToken(res.locals.token) !== session.tokenHash) {
		jsonRpcError(res, 401, "Unauthorized");
		return null;
	}
	return session;
};

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * POST /api/mcp
	 *
	 * JSON-RPC messages. An initialize request authenticates the bearer,
	 * builds a per-session MCP server whose tool set is gated by the API
	 * key's scopes, and starts a new session.
	 */
	.post(async (req, res) => {
		try {
			const sessionId = req.headers["mcp-session-id"];

			if (!sessionId && isInitializeRequest(req.body)) {
				let scopes = null;
				try {
					scopes = await authenticate(res.locals.token);
				} catch (_) {
					jsonRpcError(res, 401, "Unauthorized");
					return;
				}

				const ctx = createApiContext(res.locals.token, scopes);
				const server = createMcpServer(ctx);
				const tokenHash = hashToken(res.locals.token);
				const transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					onsessioninitialized: (sid) => {
						sessions[sid] = { transport, tokenHash };
					},
				});
				transport.onclose = () => {
					if (transport.sessionId) {
						delete sessions[transport.sessionId];
					}
				};

				await server.connect(transport);
				await transport.handleRequest(req, res, req.body);
				return;
			}

			const session = getSession(req, res);
			if (!session) {
				return;
			}
			await session.transport.handleRequest(req, res, req.body);
		} catch (err) {
			logger.error(`MCP: ${err.message}`);
			if (!res.headersSent) {
				jsonRpcError(res, 500, "Internal error");
			}
		}
	})

	/**
	 * GET /api/mcp
	 *
	 * Server-to-client SSE stream for an existing session.
	 */
	.get(async (req, res) => {
		const session = getSession(req, res);
		if (!session) {
			return;
		}
		await session.transport.handleRequest(req, res);
	})

	/**
	 * DELETE /api/mcp
	 *
	 * Terminate an existing session.
	 */
	.delete(async (req, res) => {
		const session = getSession(req, res);
		if (!session) {
			return;
		}
		await session.transport.handleRequest(req, res);
	});

export default router;
