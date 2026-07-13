import crypto from "node:crypto";
import fs from "node:fs";
import _ from "lodash";
import errs from "../lib/error.js";
import events, { NODE_CONFIG_FAILED, NODE_OFFLINE, NODE_ONLINE } from "../lib/events.js";
import { debug, node as logger } from "../logger.js";
import certificateModel from "../models/certificate.js";
import deadHostModel from "../models/dead_host.js";
import nodeModel from "../models/node.js";
import now from "../models/now_helper.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";
import settingModel from "../models/setting.js";
import nodeApplyLogModel from "../models/node_apply_log.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

const TOKEN_PREFIX = "npma_"; // one-time enrollment token
const KEY_PREFIX = "npmk_"; // per-node key issued at enrollment
// 3 missed 30s heartbeats => offline
const HEARTBEAT_TIMEOUT_MS = 90 * 1000;
const OFFLINE_CHECK_INTERVAL_MS = 30 * 1000;
const PUSH_DEBOUNCE_MS = 300;

const HOST_TYPES = [
	{ type: "proxy_host", model: proxyHostModel, expand: "[certificate,access_list.[clients,items]]" },
	{ type: "redirection_host", model: redirectionHostModel, expand: "[certificate]" },
	{ type: "dead_host", model: deadHostModel, expand: "[certificate]" },
	{ type: "stream", model: streamModel, expand: "[certificate]" },
];

const hostModelByType = (type) => HOST_TYPES.find((ht) => ht.type === type)?.model;

const hashSecret = (secret) => crypto.createHash("sha256").update(secret).digest("hex");

// "YYYY-MM-DD HH:MM:SS" in local time, matching sqlite datetime('now','localtime')
const toDbDate = (d) => {
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Never expose credentials over the API
const sanitize = (row) => {
	if (!row) {
		return row;
	}
	const out = _.omit(row, ["token_hash", "is_deleted"]);
	if (out.meta) {
		out.meta = _.omit(out.meta, ["hmac_secret"]);
	}
	return out;
};

const dockerCommand = (token) =>
	`docker run -d --name npm-agent --restart unless-stopped -p 80:80 -p 443:443 -v npm-agent-data:/data -e PANEL_URL="wss://YOUR_PANEL_HOST" -e AGENT_TOKEN="${token}" ${process.env.AGENT_IMAGE || "npm-agent:latest"}`;

// Debounce timers per node so bursts of host changes produce one snapshot push
const pushTimers = new Map();
// nodeId -> { version, hostRefs } of the most recently built snapshot,
// used to map an ack back onto the hosts it covered.
const lastPush = new Map();
// nodeId -> [ { version, resolve, timer } ] waiting for an apply ack (pushNodeAndWait).
const ackWaiters = new Map();

const getRawNode = async (id) => {
	return nodeModel.query().where("id", id).andWhere("is_deleted", 0).first();
};

const currentHostRefs = async (nodeId) => {
	const refs = [];
	for (const ht of HOST_TYPES) {
		const rows = await ht.model.query().select("id").where("is_deleted", 0).andWhere("node_id", nodeId);
		for (const row of rows) {
			refs.push({ type: ht.type, id: row.id });
		}
	}
	return refs;
};

// Enrolled = credential exchanged (has connected at least once). Pending nodes
// have no key/hmac yet and are skipped; they pick up node_all hosts on their
// first full-sync at enrollment.
const enrolledNodeIds = async () => {
	const rows = await nodeModel.query().select("id").where("is_deleted", 0).whereIn("status", ["online", "offline"]);
	return rows.map((r) => r.id);
};

// Host refs served by a node: those pinned to it plus every replicate-to-all host.
const refsForNode = async (nodeId) => {
	const refs = [];
	for (const ht of HOST_TYPES) {
		const rows = await ht.model
			.query()
			.select("id")
			.where("is_deleted", 0)
			.andWhere((b) => b.where("node_id", nodeId).orWhere("node_all", 1));
		for (const row of rows) {
			refs.push({ type: ht.type, id: row.id });
		}
	}
	return refs;
};

const getAcmeRelayUrl = async () => {
	const row = await settingModel.query().where("id", "acme-relay-url").first();
	const val = row?.value;
	return typeof val === "string" ? val.trim() : "";
};

const patchHostsMeta = async (hostRefs, metaPatch) => {
	for (const ref of hostRefs || []) {
		const model = hostModelByType(ref.type);
		if (!model) {
			continue;
		}
		const row = await model.query().where("id", ref.id).first();
		if (!row) {
			continue;
		}
		await model
			.query()
			.where("id", ref.id)
			.patch({ meta: _.assign({}, row.meta, metaPatch) });
	}
};

// Worst-of aggregate across every node serving a host, for the existing
// per-host nginx_online/nginx_err badge. Empty map keeps the prior value.
const deriveAggregate = (nodeStatus, prevOnline) => {
	const entries = Object.values(nodeStatus || {});
	const errored = entries.find((e) => e && e.ok === false);
	if (errored) {
		return { nginx_online: false, nginx_err: errored.error || "config apply failed" };
	}
	if (entries.some((e) => e && e.ok === null)) {
		return { nginx_online: null, nginx_err: null };
	}
	if (entries.length) {
		return { nginx_online: true, nginx_err: null };
	}
	return { nginx_online: prevOnline ?? null, nginx_err: null };
};

// Records this node's apply result on each covered host and re-derives the
// host's aggregate (worst-of across all nodes serving it). One node's failure
// never clears another's success — status is keyed per node.
const patchHostsNodeStatus = async (hostRefs, nodeId, status) => {
	for (const ref of hostRefs || []) {
		const model = hostModelByType(ref.type);
		if (!model) {
			continue;
		}
		const row = await model.query().where("id", ref.id).first();
		if (!row) {
			continue;
		}
		const nodeStatus = _.assign({}, row.meta?.node_status, { [nodeId]: status });
		const agg = deriveAggregate(nodeStatus, row.meta?.nginx_online);
		await model
			.query()
			.where("id", ref.id)
			.patch({ meta: _.assign({}, row.meta, { node_status: nodeStatus, ...agg }) });
	}
};

// Drop a (deleted) node's per-node status from every replicate-to-all host and
// re-derive the aggregate, so a removed node can't pin a host to degraded.
const pruneNodeStatus = async (nodeId) => {
	const key = String(nodeId);
	for (const ht of HOST_TYPES) {
		const rows = await ht.model.query().where("is_deleted", 0).andWhere("node_all", 1);
		for (const row of rows) {
			if (!row.meta?.node_status || !(key in row.meta.node_status)) {
				continue;
			}
			const nodeStatus = _.omit(row.meta.node_status, [key]);
			const agg = deriveAggregate(nodeStatus, row.meta?.nginx_online);
			await ht.model
				.query()
				.where("id", row.id)
				.patch({ meta: _.assign({}, row.meta, { node_status: nodeStatus, ...agg }) });
		}
	}
};
// Resolve pushNodeAndWait promises for a node once its agent acks a version
// at or beyond the awaited one.
const resolveAckWaiters = (nodeId, version, ok, error) => {
	const waiters = ackWaiters.get(nodeId);
	if (!waiters || !waiters.length) {
		return;
	}
	const remaining = [];
	for (const w of waiters) {
		if (version >= w.version) {
			clearTimeout(w.timer);
			w.resolve({ ok: !!ok, version, error: error || null });
		} else {
			remaining.push(w);
		}
	}
	if (remaining.length) {
		ackWaiters.set(nodeId, remaining);
	} else {
		ackWaiters.delete(nodeId);
	}
};

const patchNodeMeta = async (node, metaPatch) => {
	const fresh = await getRawNode(node.id);
	if (!fresh) {
		return;
	}
	await nodeModel
		.query()
		.where("id", node.id)
		.patch({ meta: _.assign({}, fresh.meta, metaPatch) });
};

/**
 * Render every enabled host config assigned to this node plus the cert and
 * access-list files those configs reference, as one full-state snapshot.
 */
const buildSnapshot = async (node) => {
	const configs = {};
	const files = {};
	const hostRefs = [];
	const certIds = new Set();
	const accessListIds = new Set();
	const checks = [];
	const acmeRelayUrl = await getAcmeRelayUrl();

	for (const ht of HOST_TYPES) {
		const rows = await ht.model
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.andWhere((b) => b.where("node_id", node.id).orWhere("node_all", 1))
			.withGraphFetched(ht.expand);

		for (const row of rows) {
			configs[`${ht.type}/${row.id}.conf`] = await internalNginx.renderConfig(ht.type, row, { acme_relay_url: acmeRelayUrl });
			hostRefs.push({ type: ht.type, id: row.id });
			if (ht.type === "proxy_host" && row.check_enabled) {
				checks.push({
					id: row.id,
					forward_scheme: row.forward_scheme,
					forward_host: row.forward_host,
					forward_port: row.forward_port,
					check_path: row.check_path || "/",
					check_interval_s: row.check_interval_s || 60,
					expected_status: row.expected_status || "200-399",
					domain_names: row.domain_names || [],
				});
			}
			if (row.certificate_id) {
				certIds.add(row.certificate_id);
			}
			if (row.access_list_id) {
				accessListIds.add(row.access_list_id);
			}
			for (const location of row.locations || []) {
				if (location.certificate_id) {
					certIds.add(location.certificate_id);
				}
			}
		}
	}

	const addFile = (filePath) => {
		try {
			files[filePath] = fs.readFileSync(filePath).toString("base64");
		} catch (err) {
			logger.warn(`Node ${node.id} snapshot: cannot read ${filePath}: ${err.message}`);
		}
	};

	for (const certId of certIds) {
		const cert = await certificateModel.query().where("id", certId).andWhere("is_deleted", 0).first();
		if (!cert) {
			continue;
		}
		const dir = cert.provider === "letsencrypt" ? `/etc/letsencrypt/live/npm-${certId}` : `/data/custom_ssl/npm-${certId}`;
		addFile(`${dir}/fullchain.pem`);
		addFile(`${dir}/privkey.pem`);
	}

	for (const accessListId of accessListIds) {
		addFile(`/data/access/${accessListId}`);
	}

	return { configs, files, hostRefs, checks };
};
const internalNode = {
	/**
	 * @param   {Access}  access
	 * @returns {Promise}
	 */
	getAll: async (access) => {
		await access.can("nodes:list");
		const rows = await nodeModel.query().where("is_deleted", 0).orderBy("id", "asc");
		const { default: agentWs } = await import("./agent-ws.js");
		return rows.map((row) => {
			const out = sanitize(row);
			out.connected = agentWs.isConnected(row.id);
			return out;
		});
	},

	/**
	 * @param   {Access}  access
	 * @param   {Number}  id
	 * @returns {Promise}
	 */
	get: async (access, id) => {
		await access.can("nodes:get");
		const row = await getRawNode(id);
		if (!row) {
			throw new errs.ItemNotFoundError(id);
		}
		const { default: agentWs } = await import("./agent-ws.js");
		const out = sanitize(row);
		out.connected = agentWs.isConnected(row.id);
		return out;
	},

	/**
	 * Creates a node and returns its one-time enrollment token. The token is
	 * only returned here, never again — only its hash is stored.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("nodes:manage");
		if (!data.name || !String(data.name).trim()) {
			throw new errs.ValidationError("Node name is required");
		}
		const token = TOKEN_PREFIX + crypto.randomBytes(24).toString("hex");
		const row = await nodeModel.query().insertAndFetch({
			name: String(data.name).trim(),
			token_hash: hashSecret(token),
			status: "pending",
			meta: {},
		});
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "node",
			object_id: row.id,
			meta: { name: row.name },
		});
		const out = sanitize(row);
		out.token = token;
		out.setup_command = dockerCommand(token);
		return out;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Number}  id
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	update: async (access, id, data) => {
		await access.can("nodes:manage");
		const row = await getRawNode(id);
		if (!row) {
			throw new errs.ItemNotFoundError(id);
		}
		if (data.name !== undefined) {
			if (!String(data.name).trim()) {
				throw new errs.ValidationError("Node name is required");
			}
			await nodeModel.query().where("id", id).patch({ name: String(data.name).trim() });
		}
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "node",
			object_id: id,
			meta: { name: data.name },
		});
		return internalNode.get(access, id);
	},

	/**
	 * @param   {Access}  access
	 * @param   {Number}  id
	 * @returns {Promise}
	 */
	delete: async (access, id) => {
		await access.can("nodes:manage");
		const row = await getRawNode(id);
		if (!row) {
			throw new errs.ItemNotFoundError(id);
		}
		const refs = await currentHostRefs(id);
		if (refs.length) {
			throw new errs.ValidationError(
				`Node has ${refs.length} host(s) assigned. Reassign or delete them before deleting the node.`,
			);
		}
		await nodeModel.query().where("id", id).patch({ is_deleted: 1 });
		const { default: agentWs } = await import("./agent-ws.js");
		agentWs.disconnect(id);
		await pruneNodeStatus(id);
		lastPush.delete(id);
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "node",
			object_id: id,
			meta: { name: row.name },
		});
		return true;
	},

	/**
	 * Invalidate the current credential and issue a fresh one-time enrollment
	 * token (e.g. agent reinstalled or key lost).
	 *
	 * @param   {Access}  access
	 * @param   {Number}  id
	 * @returns {Promise}
	 */
	regenerateToken: async (access, id) => {
		await access.can("nodes:manage");
		const row = await getRawNode(id);
		if (!row) {
			throw new errs.ItemNotFoundError(id);
		}
		const token = TOKEN_PREFIX + crypto.randomBytes(24).toString("hex");
		await nodeModel
			.query()
			.where("id", id)
			.patch({
				token_hash: hashSecret(token),
				status: "pending",
				meta: _.omit(row.meta || {}, ["hmac_secret"]),
			});
		const { default: agentWs } = await import("./agent-ws.js");
		agentWs.disconnect(id);
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "node",
			object_id: id,
			meta: { name: row.name, token_regenerated: true },
		});
		const out = sanitize(await getRawNode(id));
		out.token = token;
		out.setup_command = dockerCommand(token);
		return out;
	},

	// ---- Agent-facing (used by agent-ws.js, no Access object) ----

	getRawNode,
	enrolledNodeIds,

	/**
	 * Look up a node by presented credential (enrollment token or node key).
	 *
	 * @param   {String} credential
	 * @returns {Promise<{node: Object, enrolling: Boolean}|null>}
	 */
	authenticateByCredential: async (credential) => {
		if (!credential || (!credential.startsWith(TOKEN_PREFIX) && !credential.startsWith(KEY_PREFIX))) {
			return null;
		}
		const node = await nodeModel
			.query()
			.where("is_deleted", 0)
			.andWhere("token_hash", hashSecret(credential))
			.first();
		if (!node) {
			return null;
		}
		const enrolling = credential.startsWith(TOKEN_PREFIX);
		if (enrolling && node.status !== "pending") {
			// one-time token has already been exchanged
			return null;
		}
		return { node, enrolling };
	},

	/**
	 * Exchange the one-time token for a per-node key (hash stored) and an
	 * HMAC secret used to sign config bundles.
	 *
	 * @param   {Object} node
	 * @returns {Promise<{key: String, hmac_secret: String}>}
	 */
	enroll: async (node) => {
		const key = KEY_PREFIX + crypto.randomBytes(32).toString("hex");
		const hmacSecret = crypto.randomBytes(32).toString("hex");
		await nodeModel
			.query()
			.where("id", node.id)
			.patch({
				token_hash: hashSecret(key),
				meta: _.assign({}, node.meta, { hmac_secret: hmacSecret }),
			});
		logger.info(`Node ${node.id} (${node.name}) enrolled`);
		return { key, hmac_secret: hmacSecret };
	},

	/**
	 * @param  {Object}  node
	 * @param  {String}  [agentVersion]
	 */
	markOnline: async (node, agentVersion) => {
		const wasOffline = node.status === "offline";
		const patch = { status: "online", last_seen: now() };
		if (agentVersion) {
			patch.version = String(agentVersion).slice(0, 32);
		}
		await nodeModel.query().where("id", node.id).patch(patch);
		if (wasOffline) {
			logger.info(`Node ${node.id} (${node.name}) back online`);
			events.emit(NODE_ONLINE, { id: node.id, name: node.name });
		}
	},

	/**
	 * @param  {Number}  nodeId
	 */
	heartbeat: async (nodeId) => {
		const node = await getRawNode(nodeId);
		if (!node) {
			return;
		}
		if (node.status !== "online") {
			await internalNode.markOnline(node);
			return;
		}
		await nodeModel.query().where("id", nodeId).patch({ last_seen: now() });
	},

	/**
	 * @param  {Number}  nodeId
	 * @param  {String}  reason
	 */
	markOffline: async (nodeId, reason) => {
		const node = await getRawNode(nodeId);
		if (!node || node.status !== "online") {
			return;
		}
		await nodeModel.query().where("id", nodeId).patch({ status: "offline" });
		logger.warn(`Node ${node.id} (${node.name}) offline: ${reason}`);
		events.emit(NODE_OFFLINE, { id: node.id, name: node.name, error: reason });
	},

	/**
	 * Debounced full-state snapshot push; safe to call on every host change.
	 *
	 * @param  {Number}  nodeId
	 */
	schedulePush: (nodeId) => {
		if (!nodeId) {
			return;
		}
		const existing = pushTimers.get(nodeId);
		if (existing) {
			clearTimeout(existing);
		}
		pushTimers.set(
			nodeId,
			setTimeout(() => {
				pushTimers.delete(nodeId);
				internalNode.pushNode(nodeId).catch((err) => {
					logger.error(`Push to node ${nodeId} failed: ${err.message}`);
				});
			}, PUSH_DEBOUNCE_MS),
		);
	},

	/**
	 * Debounced push to every enrolled node (used by replicate-to-all hosts).
	 *
	 * @returns {Promise}
	 */
	schedulePushAll: async () => {
		const ids = await enrolledNodeIds();
		for (const id of ids) {
			internalNode.schedulePush(id);
		}
	},

	/**
	 * Schedule a push for whatever node(s) a host targets (single-pin or all).
	 *
	 * @param  {Object}  host
	 */
	scheduleHostPush: (host) => {
		if (host?.node_all) {
			internalNode.schedulePushAll().catch((err) => logger.error(`schedulePushAll failed: ${err.message}`));
		} else if (host?.node_id) {
			internalNode.schedulePush(host.node_id);
		}
	},

	/**
	 * Push a fresh snapshot NOW and wait for the agent to ack (or time out).
	 * Used before an HTTP-01 issuance so the relay location is live on the
	 * agent before the challenge fires.
	 *
	 * @param  {Number}  nodeId
	 * @param  {Number}  [timeoutMs]
	 * @returns {Promise<{ok:Boolean, version?:Number, error?:String}>}
	 */
	pushNodeAndWait: async (nodeId, timeoutMs = 20000) => {
		const node = await getRawNode(nodeId);
		if (!node) {
			return { ok: false, error: "node not found" };
		}
		const { default: agentWs } = await import("./agent-ws.js");
		if (!agentWs.isConnected(nodeId)) {
			return { ok: false, error: "node not connected" };
		}
		const sent = await internalNode.pushNode(nodeId);
		if (!sent) {
			return { ok: false, error: "push failed" };
		}
		const info = lastPush.get(nodeId);
		const version = info ? info.version : (node.config_version || 0) + 1;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				const rest = (ackWaiters.get(nodeId) || []).filter((w) => w.resolve !== resolve);
				if (rest.length) {
					ackWaiters.set(nodeId, rest);
				} else {
					ackWaiters.delete(nodeId);
				}
				resolve({ ok: false, version, error: "timeout waiting for agent ack" });
			}, timeoutMs);
			const list = ackWaiters.get(nodeId) || [];
			list.push({ version, resolve, timer });
			ackWaiters.set(nodeId, list);
		});
	},

	/**
	 * Build a new versioned snapshot for the node and send it if the agent is
	 * connected. Also used as full-sync on agent connect.
	 *
	 * @param  {Number}  nodeId
	 */
	pushNode: async (nodeId) => {
		const node = await getRawNode(nodeId);
		if (!node) {
			return false;
		}
		const snapshot = await buildSnapshot(node);
		const version = (node.config_version || 0) + 1;
		await nodeModel.query().where("id", nodeId).patch({ config_version: version });
		lastPush.set(nodeId, { version, hostRefs: snapshot.hostRefs });

		const { default: agentWs } = await import("./agent-ws.js");
		const sent = agentWs.sendConfig(node, {
			type: "config",
			version,
			configs: snapshot.configs,
			files: snapshot.files,
			checks: snapshot.checks,
		});
		debug(logger, `Node ${nodeId} snapshot v${version}: ${sent ? "pushed" : "agent not connected, will sync on connect"}`);
		return sent;
	},

	/**
	 * Agent apply result for a pushed snapshot version.
	 *
	 * @param  {Object}  node
	 * @param  {Object}  msg
	 */
	handleAck: async (node, msg) => {
		const info = lastPush.get(node.id);
		const hostRefs = info && info.version === msg.version ? info.hostRefs : await refsForNode(node.id);
		const at = toDbDate(new Date());

		if (msg.ok) {
			logger.info(`Node ${node.id} (${node.name}) applied config v${msg.version}`);
			await patchHostsNodeStatus(hostRefs, node.id, { version: msg.version, ok: true, error: null, at });
			await patchNodeMeta(node, { applied_version: msg.version, last_error: null });
		} else {
			const error = String(msg.error || "unknown error").slice(0, 2000);
			logger.error(`Node ${node.id} (${node.name}) failed to apply config v${msg.version}: ${error}`);
			await patchHostsNodeStatus(hostRefs, node.id, { version: msg.version, ok: false, error, at });
			await patchNodeMeta(node, {
				last_error: { version: msg.version, error, on: at },
			});
			events.emit(NODE_CONFIG_FAILED, { id: node.id, name: node.name, version: msg.version, error });
		}

		// Record apply result in node_apply_log; prune to 100 most recent per node.
		try {
			await nodeApplyLogModel.query().insert({
				node_id: node.id,
				version: msg.version,
				ok: msg.ok ? 1 : 0,
				error: msg.ok ? null : String(msg.error || "unknown error").slice(0, 2000),
				created_on: at,
			});
			const top100 = (
				await nodeApplyLogModel
					.query()
					.where("node_id", node.id)
					.orderBy("id", "desc")
					.limit(100)
					.select("id")
			).map((r) => r.id);
			await nodeApplyLogModel.query().where("node_id", node.id).whereNotIn("id", top100).delete();
		} catch (logErr) {
			logger.error(`Node ${node.id} apply log write failed: ${logErr.message}`);
		}

		// Wake any HTTP-01 issuance waiting on this node's apply.
		resolveAckWaiters(node.id, msg.version, msg.ok, msg.error);
	},

	/**
	 * Called from internalNginx.configure for hosts assigned to a remote node:
	 * no local file/test/reload — the agent stages, tests and acks instead.
	 *
	 * @param   {Object|String}  model
	 * @param   {String}         hostType
	 * @param   {Object}         host
	 * @returns {Promise}
	 */
	applyRemoteHost: async (model, _hostType, host) => {
		const nodeStatus = {};
		if (host.node_all) {
			await internalNode.schedulePushAll();
			for (const id of await enrolledNodeIds()) {
				nodeStatus[id] = { version: null, ok: null, error: null, at: null };
			}
		} else {
			internalNode.schedulePush(host.node_id);
			nodeStatus[host.node_id] = { version: null, ok: null, error: null, at: null };
		}
		// nginx_online=null means "pending agent ack"; the ack patches the final state.
		const combinedMeta = _.assign({}, host.meta, { nginx_online: null, nginx_err: null, node_status: nodeStatus });
		await model.query().where("id", host.id).patch({ meta: combinedMeta });
		return combinedMeta;
	},

	/**
	 * Remote-node hosts (single-pin or replicate-to-all) constrain cert choice:
	 *  - DNS-challenge or custom certs always work.
	 *  - HTTP-01 (existing or "new") works ONLY when the ACME relay is configured
	 *    (acme-relay-url): the panel solves the challenge and agents relay
	 *    /.well-known/acme-challenge/* back to it.
	 *
	 * @param  {Number|null}          nodeId
	 * @param  {Number|String|null}   certificateId
	 * @param  {Boolean}              [nodeAll]
	 */
	assertHostAllowed: async (nodeId, certificateId, nodeAll) => {
		if (!nodeId && !nodeAll) {
			return;
		}
		if (nodeId) {
			const node = await getRawNode(nodeId);
			if (!node) {
				throw new errs.ValidationError(`Node ${nodeId} does not exist`);
			}
		}
		const relayUrl = await getAcmeRelayUrl();
		if (certificateId === "new") {
			if (!relayUrl) {
				throw new errs.ValidationError(
					"Hosts on a remote node cannot request a new HTTP-01 certificate until the ACME relay is configured. Set the ACME Relay URL in Settings, or create a DNS-challenge certificate first and select it.",
				);
			}
			return;
		}
		if (!certificateId) {
			return;
		}
		const cert = await certificateModel
			.query()
			.where("id", certificateId)
			.andWhere("is_deleted", 0)
			.first();
		if (!cert) {
			throw new errs.ValidationError(`Certificate ${certificateId} does not exist`);
		}
		if (cert.provider === "letsencrypt" && !cert.meta?.dns_challenge && !relayUrl) {
			throw new errs.ValidationError(
				"Hosts on a remote node require a DNS-challenge certificate unless the ACME relay is configured. Set the ACME Relay URL in Settings, or use a DNS-challenge or custom certificate.",
			);
		}
	},


	/**
	 * @param   {Access}  access
	 * @param   {Number}  id
	 * @returns {Promise}
	 */
	sync: async (access, id) => {
		await access.can("nodes:manage");
		const row = await getRawNode(id);
		if (!row) {
			throw new errs.ItemNotFoundError(id);
		}
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "node",
			object_id: id,
			meta: { name: row.name, synced: true },
		});
		internalNode.schedulePush(id);
	},

	/**
	 * @param   {Access}  access
	 * @param   {Number}  id
	 * @param   {Number}  [limit]
	 * @returns {Promise}
	 */
	getApplyLog: async (access, id, limit = 50) => {
		await access.can("nodes:get");
		const row = await getRawNode(id);
		if (!row) {
			throw new errs.ItemNotFoundError(id);
		}
		return nodeApplyLogModel
			.query()
			.where("node_id", id)
			.orderBy("id", "desc")
			.limit(Math.min(Number(limit) || 50, 200));
	},
	/**
	 * Offline detection backstop for zombie connections: heartbeats update
	 * last_seen; when 3 heartbeats are missed the node goes offline.
	 */
	initTimer: () => {
		logger.info("Node offline-check Timer initialized");
		setInterval(async () => {
			try {
				const cutoff = toDbDate(new Date(Date.now() - HEARTBEAT_TIMEOUT_MS));
				const stale = await nodeModel
					.query()
					.where("is_deleted", 0)
					.andWhere("status", "online")
					.andWhere((builder) => {
						builder.whereNull("last_seen").orWhere("last_seen", "<", cutoff);
					});
				for (const node of stale) {
					await internalNode.markOffline(node.id, "heartbeat timeout (3 missed heartbeats)");
				}
			} catch (err) {
				logger.error(`Node offline check failed: ${err.message}`);
			}
		}, OFFLINE_CHECK_INTERVAL_MS);
	},
};

export default internalNode;
