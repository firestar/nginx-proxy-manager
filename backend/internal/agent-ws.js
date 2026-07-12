import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { debug, node as logger } from "../logger.js";
import internalNode from "./node.js";
import { ingestRemote } from "./metrics.js";
import { recordRemoteProbe } from "./uptime.js";

// Agents dial OUT to the panel: wss://panel/api/agents/ws (NAT-friendly).
// The front nginx strips the /api prefix, so the backend also answers /agents/ws.
// The front nginx strips the /api prefix, so the backend also answers /agents/ws.
const WS_PATHS = ["/agents/ws", "/api/agents/ws"];

// nodeId -> live WebSocket
const sessions = new Map();

const send = (ws, msg) => {
	try {
		ws.send(JSON.stringify(msg));
		return true;
	} catch (err) {
		logger.error(`Agent ws send failed: ${err.message}`);
		return false;
	}
};

// Config bundles are HMAC-signed with the node's secret so the agent can
// verify integrity end to end (defense in depth on top of WSS + key auth).
const signedSend = (ws, hmacSecret, msg) => {
	const payload = JSON.stringify(msg);
	const hmac = crypto.createHmac("sha256", hmacSecret).update(payload).digest("hex");
	return send(ws, { type: "signed", payload, hmac });
};

const handleMessage = async (nodeId, raw) => {
	let msg;
	try {
		msg = JSON.parse(raw.toString());
	} catch (_) {
		return;
	}
	const node = await internalNode.getRawNode(nodeId);
	if (!node) {
		return;
	}
	switch (msg.type) {
		case "hello":
			await internalNode.markOnline(node, msg.version);
			break;
		case "heartbeat":
			await internalNode.heartbeat(nodeId);
			break;
		case "ack":
			await internalNode.handleAck(node, msg);
			break;
		case "metrics":
			await ingestRemote(nodeId, msg.buckets);
			break;
		case "uptime":
			await recordRemoteProbe(nodeId, msg.hostId, {
				ok: msg.ok,
				status: msg.status,
				latencyMs: msg.latencyMs,
				error: msg.error,
			});
			break;
		default:
			debug(logger, `Node ${nodeId}: unknown message type ${msg.type}`);
	}
};

const handleConnection = async (ws, req) => {
	const credential = ((req.headers.authorization || "").match(/^Bearer\s+(.+)$/i) || [])[1] || "";
	const auth = await internalNode.authenticateByCredential(credential);
	if (!auth) {
		logger.warn(`Agent connection rejected: invalid credential (from ${req.socket.remoteAddress})`);
		ws.close(4401, "unauthorized");
		return;
	}
	const { node, enrolling } = auth;

	if (enrolling) {
		const creds = await internalNode.enroll(node);
		send(ws, { type: "enrolled", key: creds.key, hmac_secret: creds.hmac_secret });
	}

	const existing = sessions.get(node.id);
	if (existing && existing !== ws) {
		try {
			existing.close(4000, "replaced by new connection");
		} catch (_) {
			// best-effort
		}
	}
	sessions.set(node.id, ws);
	await internalNode.markOnline(node);
	logger.info(`Node ${node.id} (${node.name}) agent connected`);

	ws.on("message", (data) => {
		handleMessage(node.id, data).catch((err) => {
			logger.error(`Node ${node.id} message handling failed: ${err.message}`);
		});
	});

	ws.on("close", () => {
		if (sessions.get(node.id) === ws) {
			sessions.delete(node.id);
			internalNode.markOffline(node.id, "agent disconnected").catch((err) => {
				logger.error(`Node ${node.id} offline handling failed: ${err.message}`);
			});
		}
	});

	ws.on("error", (err) => {
		logger.error(`Node ${node.id} ws error: ${err.message}`);
	});

	// Full sync on every connect so the agent converges even after missed pushes
	await internalNode.pushNode(node.id);
};

const agentWs = {
	/**
	 * Attach the agent WebSocket endpoint to the backend HTTP server.
	 *
	 * @param {Object} httpServer  result of app.listen()
	 */
	setup: (httpServer) => {
		const wss = new WebSocketServer({ noServer: true });
		httpServer.on("upgrade", (req, socket, head) => {
			const pathname = (req.url || "").split("?")[0];
			if (!WS_PATHS.includes(pathname)) {
				socket.destroy();
				return;
			}
			wss.handleUpgrade(req, socket, head, (ws) => {
				handleConnection(ws, req).catch((err) => {
					logger.error(`Agent connection failed: ${err.message}`);
					try {
						ws.close(1011, "internal error");
					} catch (_) {
						// best-effort
					}
				});
			});
		});
		logger.info("Agent WebSocket endpoint attached at /api/agents/ws");
	},

	/**
	 * @param   {Object}  node  raw node row (needs meta.hmac_secret)
	 * @param   {Object}  msg
	 * @returns {Boolean} sent
	 */
	sendConfig: (node, msg) => {
		const ws = sessions.get(node.id);
		if (!ws || ws.readyState !== 1) {
			return false;
		}
		const secret = node.meta?.hmac_secret;
		if (!secret) {
			logger.error(`Node ${node.id} has no HMAC secret; cannot push config`);
			return false;
		}
		return signedSend(ws, secret, msg);
	},

	/**
	 * @param {Number} nodeId
	 */
	disconnect: (nodeId) => {
		const ws = sessions.get(nodeId);
		if (ws) {
			try {
				ws.close(4001, "node credential revoked");
			} catch (_) {
				// best-effort
			}
		}
		sessions.delete(nodeId);
	},

	/**
	 * @param   {Number} nodeId
	 * @returns {Boolean}
	 */
	isConnected: (nodeId) => {
		const ws = sessions.get(nodeId);
		return !!ws && ws.readyState === 1;
	},
};

export default agentWs;
