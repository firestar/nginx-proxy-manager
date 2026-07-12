#!/usr/bin/env node
// npm-agent: dials OUT to the panel (wss://panel/api/agents/ws), enrolls with
// a one-time token, then receives HMAC-signed config snapshots and applies
// them with staged nginx -t validation, atomic symlink swap and rollback.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { applySnapshot } from "./apply.js";
import { initTimer as initMetrics } from "./metrics.js";
import { initTimer as initUptime, updateChecks } from "./uptime.js";

const AGENT_VERSION = "1.0.0";
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const MAX_BACKOFF_MS = 60 * 1000;

const PANEL_URL = process.env.PANEL_URL || "";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";
const DATA_DIR = process.env.AGENT_DATA_DIR || "/data/agent";
const CREDS_FILE = path.join(DATA_DIR, "credentials.json");
// Set AGENT_TLS_VERIFY=false only for dev/self-signed panels
const TLS_VERIFY = process.env.AGENT_TLS_VERIFY !== "false";

const log = (...args) => console.log(new Date().toISOString(), "[npm-agent]", ...args);

if (!PANEL_URL) {
	log("PANEL_URL env var is required (e.g. wss://panel.example.com)");
	process.exit(1);
}

const wsUrl = () => {
	const base = PANEL_URL.replace(/\/+$/, "").replace(/^http/, "ws");
	return `${base}/api/agents/ws`;
};

const loadCreds = () => {
	try {
		return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
	} catch (_) {
		return null;
	}
};

const saveCreds = (creds) => {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(CREDS_FILE, JSON.stringify(creds), { mode: 0o600 });
};

let ws = null;
let heartbeatTimer = null;
let backoffMs = 1000;
// Applies are serialized so overlapping pushes can't interleave
let applyChain = Promise.resolve();

const send = (msg) => {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(msg));
		return true;
	}
	return false;
};
const verifyHmac = (payload, hmacHex, secret) => {
	const expected = crypto.createHmac("sha256", secret).update(payload).digest();
	const got = Buffer.from(String(hmacHex || ""), "hex");
	return got.length === expected.length && crypto.timingSafeEqual(expected, got);
};

const handleConfig = (cfg) => {
	applyChain = applyChain.then(async () => {
		const nConfigs = Object.keys(cfg.configs || {}).length;
		const nFiles = Object.keys(cfg.files || {}).length;
		log(`Applying snapshot v${cfg.version} (${nConfigs} configs, ${nFiles} files)`);
		try {
			await applySnapshot(DATA_DIR, cfg);
			log(`Snapshot v${cfg.version} applied, nginx reloaded`);
			send({ type: "ack", version: cfg.version, ok: true });
		} catch (err) {
			log(`Snapshot v${cfg.version} FAILED, rolled back to previous snapshot: ${err.message}`);
			send({ type: "ack", version: cfg.version, ok: false, error: err.message });
		}
	});
};

const onMessage = (raw) => {
	let msg;
	try {
		msg = JSON.parse(raw.toString());
	} catch (_) {
		return;
	}

	switch (msg.type) {
		case "enrolled":
			saveCreds({ key: msg.key, hmac_secret: msg.hmac_secret });
			log("Enrolled with panel; per-node key stored");
			break;

		case "signed": {
			const creds = loadCreds();
			if (!creds?.hmac_secret) {
				log("Received signed message but no HMAC secret stored yet; ignoring");
				return;
			}
			if (!verifyHmac(msg.payload, msg.hmac, creds.hmac_secret)) {
				log("HMAC verification FAILED; ignoring message");
				return;
			}
			let inner;
			try {
				inner = JSON.parse(msg.payload);
			if (inner.type === "config") {
				updateChecks(inner.checks || []);
				handleConfig(inner);
			}
				handleConfig(inner);
			}
			break;
		}

		default:
			break;
	}
};

const connect = () => {
	const creds = loadCreds();
	const credential = creds?.key || AGENT_TOKEN;
	if (!credential) {
		log("No stored node key and no AGENT_TOKEN provided; cannot connect");
		process.exit(1);
	}

	log(`Connecting to ${wsUrl()} using ${creds?.key ? "node key" : "enrollment token"}`);
	ws = new WebSocket(wsUrl(), {
		headers: { authorization: `Bearer ${credential}` },
		rejectUnauthorized: TLS_VERIFY,
	});

	ws.on("open", () => {
		backoffMs = 1000;
		log("Connected to panel");
		send({ type: "hello", version: AGENT_VERSION });
		heartbeatTimer = setInterval(() => send({ type: "heartbeat" }), HEARTBEAT_INTERVAL_MS);
	});

	ws.on("message", onMessage);

	ws.on("error", (err) => {
		log(`WebSocket error: ${err.message}`);
	});

	ws.on("close", (code, reason) => {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
		log(`Disconnected (code ${code}${reason ? `: ${reason}` : ""}); retrying in ${Math.round(backoffMs / 1000)}s`);
		setTimeout(connect, backoffMs);
		backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
	});
};

connect();

// Start collection timers after startup — they use the send() function which
// returns false while disconnected; state is held and shipped on reconnect.
initMetrics(DATA_DIR, send);
initUptime(send);
