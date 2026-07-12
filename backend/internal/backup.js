import fs from "node:fs";
import path from "node:path";
import archive from "../lib/backup/archive.js";
import cron from "../lib/backup/cron.js";
import s3 from "../lib/backup/s3.js";
import events, { BACKUP_FAILED, BACKUP_OK } from "../lib/events.js";
import { backup as logger } from "../logger.js";
import accessListModel from "../models/access_list.js";
import accessListAuthModel from "../models/access_list_auth.js";
import accessListClientModel from "../models/access_list_client.js";
import backupRunModel from "../models/backup_run.js";
import certificateModel from "../models/certificate.js";
import deadHostModel from "../models/dead_host.js";
import deadHostTagModel from "../models/dead_host_tag.js";
import proxyHostModel from "../models/proxy_host.js";
import proxyHostTagModel from "../models/proxy_host_tag.js";
import redirectionHostModel from "../models/redirection_host.js";
import redirectionHostTagModel from "../models/redirection_host_tag.js";
import settingModel from "../models/setting.js";
import streamModel from "../models/stream.js";
import streamTagModel from "../models/stream_tag.js";
import tagModel from "../models/tag.js";
import userModel from "../models/user.js";
import userTagModel from "../models/user_tag.js";
import nodeModel from "../models/node.js";
import notificationChannelModel from "../models/notification_channel.js";
import pjson from "../package.json" with { type: "json" };
import db from "../db.js";
import internalNginx from "./nginx.js";

const SCHEMA_VERSION = 1;
const SCHEDULE_ID = "backup-schedule";
const LE_LIVE = "/etc/letsencrypt/live";
const CUSTOM_SSL = "/data/custom_ssl";
const NGINX_CUSTOM = "/data/nginx/custom";
const NGINX_MAINT = "/data/nginx/maintenance";

const nowStr = () => new Date().toISOString().replace("T", " ").split(".")[0];

// ---- disk helpers --------------------------------------------------------

/** Recursively collect files under absDir into archive entries prefixed with `prefix`. */
const readDirInto = (entries, absDir, prefix) => {
	if (!fs.existsSync(absDir)) {
		return;
	}
	for (const name of fs.readdirSync(absDir)) {
		const abs = path.join(absDir, name);
		const rel = `${prefix}/${name}`;
		const stat = fs.statSync(abs); // follows symlinks — resolves LE live symlinks to real PEMs
		if (stat.isDirectory()) {
			readDirInto(entries, abs, rel);
		} else if (stat.isFile()) {
			entries.push({ name: rel, data: fs.readFileSync(abs) });
		}
	}
};

/** Write a file from the archive to disk, creating parent dirs. */
const writeFileEnsured = (abs, buffer) => {
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, buffer);
};

// ---- gather --------------------------------------------------------------

/**
 * Read every backup-relevant table (via models, so JSON/bool columns are
 * normalised) plus on-disk certificate material and custom/maintenance nginx
 * snippets. Users are dumped without secrets (the user table holds none —
 * password hashes live in the `auth` table, which is never included).
 */
const gather = async () => {
	const entries = [];

	const users = await userModel.query().where("is_deleted", 0);
	const tags = await tagModel.query().where("is_deleted", 0);
	const certificates = await certificateModel.query().where("is_deleted", 0);
	const accessLists = await accessListModel.query().where("is_deleted", 0);
	const accessListAuth = await accessListAuthModel.query();
	const accessListClients = await accessListClientModel.query();
	const proxyHosts = await proxyHostModel.query().where("is_deleted", 0);
	const redirectionHosts = await redirectionHostModel.query().where("is_deleted", 0);
	const deadHosts = await deadHostModel.query().where("is_deleted", 0);
	const streams = await streamModel.query().where("is_deleted", 0);
	const proxyHostTags = await proxyHostTagModel.query();
	const redirectionHostTags = await redirectionHostTagModel.query();
	const deadHostTags = await deadHostTagModel.query();
	const streamTags = await streamTagModel.query();
	const userTags = await userTagModel.query();
	const settings = await settingModel.query();
	const nodes = await nodeModel.query().where("is_deleted", 0);
	const notificationChannels = await notificationChannelModel.query().where("is_deleted", 0);

	// Strip anything sensitive from users just in case a column is added later.
	const safeUsers = users.map((u) => {
		const { secret, ...rest } = u;
		return rest;
	});

	// Strip node secrets: token_hash (auth credential) and meta.hmac_secret (plaintext signing key).
	// Nodes must re-enroll after restore.
	const safeNodes = nodes.map((n) => {
		const { token_hash, ...rest } = n;
		if (rest.meta) {
			const { hmac_secret, ...safeMeta } = rest.meta;
			rest.meta = safeMeta;
		}
		return rest;
	});

	// Strip notification channel config (contains webhook tokens, SMTP passwords).
	// Channels are restored with name/type/events/enabled; credentials must be re-entered.
	const safeNotificationChannels = notificationChannels.map((ch) => {
		const { config, ...rest } = ch;
		return { ...rest, config: {} };
	});

	const manifest = {
		schema_version: SCHEMA_VERSION,
		npm_version: pjson.version,
		created_on: nowStr(),
		users: safeUsers,
		tags,
		certificates,
		access_lists: accessLists,
		access_list_auth: accessListAuth,
		access_list_clients: accessListClients,
		proxy_hosts: proxyHosts,
		redirection_hosts: redirectionHosts,
		dead_hosts: deadHosts,
		streams,
		proxy_host_tags: proxyHostTags,
		redirection_host_tags: redirectionHostTags,
		dead_host_tags: deadHostTags,
		stream_tags: streamTags,
		user_tags: userTags,
		settings,
		nodes: safeNodes,
		notification_channels: safeNotificationChannels,
	};

	entries.push({ name: "manifest.json", data: JSON.stringify(manifest, null, 2) });

	// Certificate material on disk.
	for (const cert of certificates) {
		if (cert.provider === "letsencrypt") {
			readDirInto(entries, path.join(LE_LIVE, `npm-${cert.id}`), `certs/live/${cert.id}`);
		} else {
			readDirInto(entries, path.join(CUSTOM_SSL, `npm-${cert.id}`), `certs/custom/${cert.id}`);
		}
	}

	// Custom + maintenance nginx snippets.
	readDirInto(entries, NGINX_CUSTOM, "nginx/custom");
	readDirInto(entries, NGINX_MAINT, "nginx/maintenance");

	return { manifest, entries };
};

/**
 * Build a backup archive.
 * @param {{encrypt?: boolean, passphrase?: string}} [opts]
 * @returns {Promise<{buffer: Buffer, filename: string, manifest: Object, encrypted: boolean}>}
 */
const build = async (opts = {}) => {
	const { manifest, entries } = await gather();
	const encrypt = !!(opts.encrypt && opts.passphrase);
	const buffer = await archive.pack(entries, encrypt ? { passphrase: opts.passphrase } : {});
	const stamp = nowStr().replace(/[: ]/g, "-");
	const filename = `npm-backup-${stamp}.tar.gz${encrypt ? ".enc" : ""}`;
	return { buffer, filename, manifest, encrypted: encrypt };
};

// ---- import: matching + planning ----------------------------------------

const sortedDomains = (row) => {
	const d = Array.isArray(row.domain_names) ? row.domain_names : [];
	return [...d].sort().join(",");
};

// Compare two rows ignoring id + timestamps.
const IGNORED = new Set(["id", "created_on", "modified_on"]);
const normalizedEqual = (a, b) => {
	const clean = (o) => {
		const c = {};
		for (const k of Object.keys(o).sort()) {
			if (!IGNORED.has(k)) {
				c[k] = o[k];
			}
		}
		return JSON.stringify(c);
	};
	return clean(a) === clean(b);
};

/**
 * Entity descriptors drive both plan and import: how to find an existing row
 * for a manifest item and a human label. FK remapping is handled explicitly
 * in importAll() where dependency order matters.
 */
const entityLabel = {
	users: (r) => r.email,
	tags: (r) => r.name,
	certificates: (r) => `${r.nice_name || (r.domain_names || []).join(", ")}`,
	access_lists: (r) => r.name,
	proxy_hosts: (r) => (r.domain_names || []).join(", "),
	redirection_hosts: (r) => (r.domain_names || []).join(", "),
	dead_hosts: (r) => (r.domain_names || []).join(", "),
	streams: (r) => `:${r.incoming_port}`,
	settings: (r) => r.id,
	nodes: (r) => r.name,
	notification_channels: (r) => `${r.name} (${r.type})`,
};

const findExisting = {
	users: (rows, item) => rows.filter((r) => r.email === item.email),
	tags: (rows, item) => rows.filter((r) => r.name === item.name),
	certificates: (rows, item) =>
		rows.filter((r) => r.nice_name === item.nice_name && sortedDomains(r) === sortedDomains(item)),
	access_lists: (rows, item) => rows.filter((r) => r.name === item.name),
	proxy_hosts: (rows, item) => rows.filter((r) => sortedDomains(r) === sortedDomains(item)),
	redirection_hosts: (rows, item) => rows.filter((r) => sortedDomains(r) === sortedDomains(item)),
	dead_hosts: (rows, item) => rows.filter((r) => sortedDomains(r) === sortedDomains(item)),
	streams: (rows, item) => rows.filter((r) => r.incoming_port === item.incoming_port),
	settings: (rows, item) => rows.filter((r) => r.id === item.id),
	nodes: (rows, item) => rows.filter((r) => r.name === item.name),
	notification_channels: (rows, item) => rows.filter((r) => r.name === item.name && r.type === item.type),
};

// Current DB rows for each entity type, used for matching during plan/import.
const loadCurrent = async () => ({
	users: await userModel.query().where("is_deleted", 0),
	tags: await tagModel.query().where("is_deleted", 0),
	certificates: await certificateModel.query().where("is_deleted", 0),
	access_lists: await accessListModel.query().where("is_deleted", 0),
	proxy_hosts: await proxyHostModel.query().where("is_deleted", 0),
	redirection_hosts: await redirectionHostModel.query().where("is_deleted", 0),
	dead_hosts: await deadHostModel.query().where("is_deleted", 0),
	streams: await streamModel.query().where("is_deleted", 0),
	settings: await settingModel.query(),
	nodes: await nodeModel.query().where("is_deleted", 0),
	notification_channels: await notificationChannelModel.query().where("is_deleted", 0),
});

const PLAN_TYPES = [
	"users",
	"tags",
	"certificates",
	"access_lists",
	"proxy_hosts",
	"redirection_hosts",
	"dead_hosts",
	"streams",
	"settings",
	"nodes",
	"notification_channels",
];

/**
 * Compute a per-item plan (create|update|skip|conflict) WITHOUT writing.
 * @param {Object} manifest
 * @returns {Promise<{items: Array, summary: Object}>}
 */
const computePlan = async (manifest) => {
	const current = await loadCurrent();
	const items = [];
	const summary = { create: 0, update: 0, skip: 0, conflict: 0 };
	for (const type of PLAN_TYPES) {
		for (const item of manifest[type] || []) {
			const matches = findExisting[type](current[type], item);
			let action;
			if (matches.length === 0) {
				action = "create";
			} else if (matches.length > 1) {
				action = "conflict";
			} else {
				action = normalizedEqual(matches[0], item) ? "skip" : "update";
			}
			summary[action] += 1;
			items.push({ type, name: entityLabel[type](item), action });
		}
	}
	return { items, summary };
};

// ---- import: apply -------------------------------------------------------

const stripInsert = (row) => {
	const { id, created_on, modified_on, ...rest } = row;
	return rest;
};

const remapFk = (value, map) => {
	if (value === undefined || value === null || value === 0) {
		return value;
	}
	return map[value] ?? value;
};

const restoreCertFiles = (files, oldId, newId, provider) => {
	const [srcPrefix, destBase] =
		provider === "letsencrypt"
			? [`certs/live/${oldId}/`, path.join(LE_LIVE, `npm-${newId}`)]
			: [`certs/custom/${oldId}/`, path.join(CUSTOM_SSL, `npm-${newId}`)];
	for (const [name, buf] of files) {
		if (name.startsWith(srcPrefix)) {
			writeFileEnsured(path.join(destBase, name.slice(srcPrefix.length)), buf);
		}
	}
};

/**
 * Apply a backup in one transaction with ID remapping, then regenerate the
 * configs of created/updated hosts through P1's safe nginx path. Existing
 * rows matched by natural key are updated in place; ambiguous matches are
 * skipped as conflicts. Certificate files and nginx snippets are restored to
 * disk after the transaction commits.
 *
 * @param {Object} manifest
 * @param {Map<string,Buffer>} files
 * @returns {Promise<{items: Array, regenerated: Array}>}
 */
const importAll = async (manifest, files) => {
	const knex = db();
	const results = [];
	const userMap = {};
	const tagMap = {};
	const certMap = {};
	const aclMap = {};
	// Hosts created/updated during the transaction, regenerated afterwards.
	const toRegen = { proxy_host: [], redirection_host: [], dead_host: [], stream: [] };
	// Certificate file restores deferred until after commit.
	const certRestores = [];

	await knex.transaction(async (trx) => {
		const current = await loadCurrent();

		const resolveMatch = (type, item) => {
			const matches = findExisting[type](current[type], item);
			if (matches.length > 1) {
				return { conflict: true };
			}
			return { existing: matches[0] };
		};

		// 1. Users — match by email; never overwrite an existing account.
		for (const item of manifest.users || []) {
			const { existing, conflict } = resolveMatch("users", item);
			if (conflict) {
				results.push({ type: "users", name: entityLabel.users(item), action: "conflict" });
				continue;
			}
			if (existing) {
				userMap[item.id] = existing.id;
				results.push({ type: "users", name: entityLabel.users(item), action: "skip" });
			} else {
				const created = await userModel.query(trx).insertAndFetch(stripInsert(item));
				userMap[item.id] = created.id;
				results.push({ type: "users", name: entityLabel.users(item), action: "create" });
			}
		}

		// 2. Tags — match by name.
		for (const item of manifest.tags || []) {
			const { existing, conflict } = resolveMatch("tags", item);
			if (conflict) {
				results.push({ type: "tags", name: entityLabel.tags(item), action: "conflict" });
				continue;
			}
			if (existing) {
				tagMap[item.id] = existing.id;
				results.push({ type: "tags", name: entityLabel.tags(item), action: "skip" });
			} else {
				const created = await tagModel.query(trx).insertAndFetch(stripInsert(item));
				tagMap[item.id] = created.id;
				results.push({ type: "tags", name: entityLabel.tags(item), action: "create" });
			}
		}

		// 3. Certificates — restore files for newly created certs.
		for (const item of manifest.certificates || []) {
			const { existing, conflict } = resolveMatch("certificates", item);
			if (conflict) {
				results.push({ type: "certificates", name: entityLabel.certificates(item), action: "conflict" });
				continue;
			}
			if (existing) {
				certMap[item.id] = existing.id;
				results.push({ type: "certificates", name: entityLabel.certificates(item), action: "skip" });
			} else {
				const insert = stripInsert(item);
				insert.owner_user_id = remapFk(insert.owner_user_id, userMap);
				const created = await certificateModel.query(trx).insertAndFetch(insert);
				certMap[item.id] = created.id;
				certRestores.push({ oldId: item.id, newId: created.id, provider: item.provider });
				results.push({ type: "certificates", name: entityLabel.certificates(item), action: "create" });
			}
		}

		// 4. Access lists (+ auth items + clients).
		for (const item of manifest.access_lists || []) {
			const { existing, conflict } = resolveMatch("access_lists", item);
			if (conflict) {
				results.push({ type: "access_lists", name: entityLabel.access_lists(item), action: "conflict" });
				continue;
			}
			if (existing) {
				aclMap[item.id] = existing.id;
				results.push({ type: "access_lists", name: entityLabel.access_lists(item), action: "skip" });
			} else {
				const insert = stripInsert(item);
				insert.owner_user_id = remapFk(insert.owner_user_id, userMap);
				const created = await accessListModel.query(trx).insertAndFetch(insert);
				aclMap[item.id] = created.id;
				for (const auth of (manifest.access_list_auth || []).filter((a) => a.access_list_id === item.id)) {
					const a = stripInsert(auth);
					a.access_list_id = created.id;
					await accessListAuthModel.query(trx).insert(a);
				}
				for (const client of (manifest.access_list_clients || []).filter((c) => c.access_list_id === item.id)) {
					const c = stripInsert(client);
					c.access_list_id = created.id;
					await accessListClientModel.query(trx).insert(c);
				}
				results.push({ type: "access_lists", name: entityLabel.access_lists(item), action: "create" });
			}
		}

		// 5. Hosts.
		const importHosts = async (type, model, pivotModel, pivotFk, manifestKey, pivotKey) => {
			for (const item of manifest[manifestKey] || []) {
				const { existing, conflict } = resolveMatch(type, item);
				if (conflict) {
					results.push({ type, name: entityLabel[type](item), action: "conflict" });
					continue;
				}
				if (existing) {
					results.push({ type, name: entityLabel[type](item), action: "skip" });
					continue;
				}
				const insert = stripInsert(item);
				insert.owner_user_id = remapFk(insert.owner_user_id, userMap);
				if ("certificate_id" in insert) {
					insert.certificate_id = remapFk(insert.certificate_id, certMap);
				}
				if ("access_list_id" in insert) {
					insert.access_list_id = remapFk(insert.access_list_id, aclMap);
				}
				if ("node_id" in insert) {
					insert.node_id = null;
				}
				const created = await model.query(trx).insertAndFetch(insert);
				// Tag pivots.
				for (const pv of (manifest[pivotKey] || []).filter((p) => p[pivotFk] === item.id)) {
					await pivotModel.query(trx).insert({ [pivotFk]: created.id, tag_id: remapFk(pv.tag_id, tagMap) });
				}
				toRegen[type].push(created.id);
				results.push({ type, name: entityLabel[type](item), action: "create" });
			}
		};

		await importHosts("proxy_hosts", proxyHostModel, proxyHostTagModel, "proxy_host_id", "proxy_hosts", "proxy_host_tags");
		await importHosts(
			"redirection_hosts",
			redirectionHostModel,
			redirectionHostTagModel,
			"redirection_host_id",
			"redirection_hosts",
			"redirection_host_tags",
		);
		await importHosts("dead_hosts", deadHostModel, deadHostTagModel, "dead_host_id", "dead_hosts", "dead_host_tags");
		await importHosts("streams", streamModel, streamTagModel, "stream_id", "streams", "stream_tags");

		// 6. User-tag pivots.
		for (const ut of manifest.user_tags || []) {
			const userId = userMap[ut.user_id];
			const tagId = tagMap[ut.tag_id];
			if (!userId || !tagId) {
				continue;
			}
			const exists = await userTagModel.query(trx).where("user_id", userId).where("tag_id", tagId).first();
			if (!exists) {
				await userTagModel.query(trx).insert({ user_id: userId, tag_id: tagId });
			}
		}

		// 7. Settings — upsert by id (backup-schedule is not restored to avoid stale S3 creds).
		for (const item of manifest.settings || []) {
			if (item.id === SCHEDULE_ID) {
				results.push({ type: "settings", name: item.id, action: "skip" });
				continue;
			}
			const existing = await settingModel.query(trx).where("id", item.id).first();
			if (existing) {
				if (normalizedEqual(existing, item)) {
					results.push({ type: "settings", name: item.id, action: "skip" });
				} else {
					await settingModel.query(trx).where("id", item.id).patch({ value: item.value, meta: item.meta });
					results.push({ type: "settings", name: item.id, action: "update" });
				}
			} else {
				await settingModel.query(trx).insert(item);
				results.push({ type: "settings", name: item.id, action: "create" });
			}
		}

		// 8. Notification channels — config was scrubbed on export; credentials need re-entry after restore.
		for (const item of manifest.notification_channels || []) {
			const { existing, conflict } = resolveMatch("notification_channels", item);
			if (conflict) {
				results.push({ type: "notification_channels", name: entityLabel.notification_channels(item), action: "conflict" });
				continue;
			}
			if (existing) {
				results.push({ type: "notification_channels", name: entityLabel.notification_channels(item), action: "skip" });
			} else {
				await notificationChannelModel.query(trx).insert(stripInsert(item));
				results.push({ type: "notification_channels", name: entityLabel.notification_channels(item), action: "create" });
			}
		}

		// 9. Nodes — included in manifest for reference only; token_hash was scrubbed.
		// Nodes must re-enroll after restore.
		for (const item of manifest.nodes || []) {
			results.push({ type: "nodes", name: entityLabel.nodes(item), action: "skip" });
		}
	});

	// Post-commit: restore disk material.
	for (const { oldId, newId, provider } of certRestores) {
		restoreCertFiles(files, oldId, newId, provider);
	}
	for (const [name, buf] of files) {
		if (name.startsWith("nginx/custom/")) {
			writeFileEnsured(path.join(NGINX_CUSTOM, name.slice("nginx/custom/".length)), buf);
		} else if (name.startsWith("nginx/maintenance/")) {
			writeFileEnsured(path.join(NGINX_MAINT, name.slice("nginx/maintenance/".length)), buf);
		}
	}

	// Post-commit: regenerate configs of created hosts through P1's safe path.
	const regenerated = await regenHosts(toRegen);

	return { items: results, regenerated };
};

const HOST_MODELS = {
	proxy_host: proxyHostModel,
	redirection_host: redirectionHostModel,
	dead_host: deadHostModel,
	stream: streamModel,
};

const regenHosts = async (toRegen) => {
	const out = [];
	for (const [hostType, ids] of Object.entries(toRegen)) {
		if (!ids.length) {
			continue;
		}
		const model = HOST_MODELS[hostType];
		const rows = await model
			.query()
			.whereIn("id", ids)
			.andWhere("is_deleted", 0)
			.andWhere("enabled", 1)
			.allowGraph(model.defaultAllowGraph)
			.withGraphFetched(`[${model.defaultExpand.join(", ")}]`);
		for (const row of rows) {
			try {
				await internalNginx.configure(model, hostType, row);
				out.push({ type: hostType, id: row.id, ok: true });
			} catch (err) {
				out.push({ type: hostType, id: row.id, ok: false, error: err.message });
			}
		}
	}
	return out;
};

// ---- schedule ------------------------------------------------------------

const REDACTED = "__unchanged__";

const readScheduleRow = async () => {
	const row = await settingModel.query().where("id", SCHEDULE_ID).first();
	if (row) {
		return row;
	}
	// Fallback if the seed row is missing.
	return {
		id: SCHEDULE_ID,
		value: "disabled",
		meta: { cron: "0 3 * * *", retention_count: 7, encrypt: false, passphrase: "", s3: {} },
	};
};

/** Schedule with write-only secrets redacted (never echoed by the API). */
const getSchedule = async () => {
	const row = await readScheduleRow();
	const meta = row.meta || {};
	const s3cfg = meta.s3 || {};
	return {
		enabled: row.value === "enabled",
		cron: meta.cron || "0 3 * * *",
		retention_count: meta.retention_count ?? 7,
		encrypt: !!meta.encrypt,
		has_passphrase: !!meta.passphrase,
		s3: {
			endpoint: s3cfg.endpoint || "",
			region: s3cfg.region || "us-east-1",
			bucket: s3cfg.bucket || "",
			access_key: s3cfg.access_key || "",
			has_secret_key: !!s3cfg.secret_key,
			prefix: s3cfg.prefix || "npm-backups",
			force_path_style: s3cfg.force_path_style !== false,
		},
	};
};

/**
 * Persist schedule settings. Secret fields (s3.secret_key, passphrase) are
 * write-only: an empty/absent value keeps whatever is stored.
 */
const setSchedule = async (data) => {
	const row = await readScheduleRow();
	const meta = row.meta || {};
	const prevS3 = meta.s3 || {};
	const inS3 = data.s3 || {};

	const newMeta = {
		cron: data.cron ?? meta.cron ?? "0 3 * * *",
		retention_count: data.retention_count ?? meta.retention_count ?? 7,
		encrypt: data.encrypt ?? meta.encrypt ?? false,
		passphrase: data.passphrase ? data.passphrase : meta.passphrase || "",
		s3: {
			endpoint: inS3.endpoint ?? prevS3.endpoint ?? "",
			region: inS3.region ?? prevS3.region ?? "us-east-1",
			bucket: inS3.bucket ?? prevS3.bucket ?? "",
			access_key: inS3.access_key ?? prevS3.access_key ?? "",
			secret_key: inS3.secret_key ? inS3.secret_key : prevS3.secret_key || "",
			prefix: inS3.prefix ?? prevS3.prefix ?? "npm-backups",
			force_path_style: inS3.force_path_style ?? prevS3.force_path_style ?? true,
		},
	};
	// Validate cron up front so a bad expression is rejected at save time.
	cron.parse(newMeta.cron);

	const value = data.enabled ? "enabled" : "disabled";
	const existing = await settingModel.query().where("id", SCHEDULE_ID).first();
	if (existing) {
		await settingModel.query().where("id", SCHEDULE_ID).patch({ value, meta: newMeta });
	} else {
		await settingModel.query().insert({
			id: SCHEDULE_ID,
			name: "Backup Schedule",
			description: "Scheduled backup + S3/MinIO upload configuration",
			value,
			meta: newMeta,
		});
	}
	return getSchedule();
};

// ---- run + prune (S3) ----------------------------------------------------

/**
 * Build a backup and, if S3 is configured, upload it and prune to
 * retention_count. Records a backup_run row and emits BACKUP_OK/BACKUP_FAILED.
 * @param {"manual"|"scheduled"} trigger
 */
const run = async (trigger = "manual") => {
	const row = await readScheduleRow();
	const meta = row.meta || {};
	const s3cfg = meta.s3 || {};
	const useS3 = !!(s3cfg.endpoint && s3cfg.bucket && s3cfg.access_key && s3cfg.secret_key);

	try {
		const { buffer, filename, encrypted } = await build({ encrypt: meta.encrypt, passphrase: meta.passphrase });

		let s3Key = null;
		if (useS3) {
			const prefix = s3cfg.prefix ? s3cfg.prefix.replace(/\/$/, "") : "";
			s3Key = prefix ? `${prefix}/${filename}` : filename;
			await s3.putObject(s3cfg, s3Key, buffer);
			await prune(s3cfg, meta.retention_count ?? 7);
		}

		await backupRunModel.query().insert({
			status: "ok",
			trigger,
			destination: useS3 ? "s3" : "local",
			filename,
			s3_key: s3Key,
			size: buffer.length,
			encrypted: encrypted ? 1 : 0,
			error: null,
		});
		events.emit(BACKUP_OK, { destination: useS3 ? "s3" : "local", size: buffer.length, filename, trigger });
		logger.info(`Backup (${trigger}) succeeded: ${filename} (${buffer.length} bytes)`);
		return { ok: true, filename, size: buffer.length, destination: useS3 ? "s3" : "local", s3_key: s3Key };
	} catch (err) {
		await backupRunModel
			.query()
			.insert({
				status: "failed",
				trigger,
				destination: useS3 ? "s3" : "local",
				size: 0,
				error: String(err.message).slice(0, 1000),
			})
			.catch(() => {});
		events.emit(BACKUP_FAILED, { destination: useS3 ? "s3" : "local", error: err.message, trigger });
		logger.error(`Backup (${trigger}) failed: ${err.message}`);
		throw err;
	}
};

/** Delete oldest S3 objects beyond retention_count (by key, which is timestamp-sortable). */
const prune = async (s3cfg, retention) => {
	if (!retention || retention < 1) {
		return;
	}
	const prefix = s3cfg.prefix ? `${s3cfg.prefix.replace(/\/$/, "")}/npm-backup-` : "npm-backup-";
	const objects = (await s3.listObjects(s3cfg, prefix)).sort((a, b) => a.key.localeCompare(b.key));
	const excess = objects.length - retention;
	for (let i = 0; i < excess; i++) {
		await s3.deleteObject(s3cfg, objects[i].key);
		logger.info(`Pruned old backup: ${objects[i].key}`);
	}
};

// ---- timer ---------------------------------------------------------------

const internalBackup = {
	interval: null,
	intervalTimeout: 60 * 1000, // check every minute
	lastMinute: null,

	build,
	getSchedule,
	setSchedule,
	run,

	/** Dry run: returns the plan without writing anything. */
	planImport: async (buffer, passphrase) => {
		const files = await archive.unpack(buffer, passphrase ? { passphrase } : {});
		const manifest = JSON.parse(files.get("manifest.json").toString("utf8"));
		return computePlan(manifest);
	},

	/** Real import in a transaction, then safe config regeneration. */
	runImport: async (buffer, passphrase) => {
		const files = await archive.unpack(buffer, passphrase ? { passphrase } : {});
		const manifest = JSON.parse(files.get("manifest.json").toString("utf8"));
		return importAll(manifest, files);
	},

	getHistory: async () => backupRunModel.query().orderBy("created_on", "DESC").limit(50),

	/** Fire scheduled backups when the cron matches the current minute. */
	tick: async () => {
		try {
			const row = await readScheduleRow();
			if (row.value !== "enabled") {
				return;
			}
			const meta = row.meta || {};
			const now = new Date();
			const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
			if (internalBackup.lastMinute === stamp) {
				return; // already handled this minute
			}
			if (cron.matches(meta.cron || "0 3 * * *", now)) {
				internalBackup.lastMinute = stamp;
				await run("scheduled").catch(() => {});
			}
		} catch (err) {
			logger.error(`Backup timer error: ${err.message}`);
		}
	},

	initTimer: () => {
		logger.info("Backup Timer initialized");
		internalBackup.interval = setInterval(internalBackup.tick, internalBackup.intervalTimeout);
	},
};

export default internalBackup;
