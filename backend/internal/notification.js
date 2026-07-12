import nodemailer from "nodemailer";
import events, {
	BACKUP_FAILED,
	BACKUP_OK,
	CERTIFICATE_EXPIRING,
	CERTIFICATE_RENEWAL_FAILED,
	HOST_OFFLINE,
	HOST_ONLINE,
	NODE_CONFIG_FAILED,
	NODE_OFFLINE,
	NODE_ONLINE,
	UPSTREAM_DOWN,
	UPSTREAM_UP,
} from "../lib/events.js";
import { notification as logger } from "../logger.js";
import notificationChannelModel from "../models/notification_channel.js";
import notificationLogModel from "../models/notification_log.js";
import settingModel from "../models/setting.js";

// Certificate expiry uses ~1-day dedupe so each cert alerts at most once/day while expiring.
const DEDUPE_WINDOWS = {
	[CERTIFICATE_EXPIRING]: 23 * 60 * 60 * 1000,
};
const DEFAULT_DEDUPE_MS = 60 * 60 * 1000; // 1h for host events and renewal_failed

const ALL_EVENTS = [HOST_OFFLINE, HOST_ONLINE, CERTIFICATE_EXPIRING, CERTIFICATE_RENEWAL_FAILED, UPSTREAM_DOWN, UPSTREAM_UP, BACKUP_OK, BACKUP_FAILED, NODE_OFFLINE, NODE_ONLINE, NODE_CONFIG_FAILED];

// Build a dedupe key from event + object id (no days suffix — window handles per-day deduping)
const dedupeKey = (eventName, payload) => {
	const id = payload.id ?? "unknown";
	return `${eventName}:${id}`;
};

// Check if we've already sent this event+object within the event-type's dedupe window
const isDupe = async (channelId, eventName, payload) => {
	const windowMs = DEDUPE_WINDOWS[eventName] ?? DEFAULT_DEDUPE_MS;
	const since = new Date(Date.now() - windowMs).toISOString().replace("T", " ").split(".")[0];
	const key = dedupeKey(eventName, payload);
	const row = await notificationLogModel
		.query()
		.where("channel_id", channelId)
		.where("event", key)
		.where("status", "sent")
		.where("created_on", ">=", since)
		.first();
	return !!row;
};

const writeLog = async (channelId, eventName, payload, status, detail) => {
	try {
		await notificationLogModel.query().insert({
			channel_id: channelId,
			event: dedupeKey(eventName, payload),
			status,
			detail: detail ? String(detail).slice(0, 2000) : null,
		});
	} catch (err) {
		logger.error("Failed to write notification log:", err.message);
	}
};

// Retry with exponential backoff
const withRetry = async (fn, retries = 3) => {
	let lastErr;
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt < retries - 1) {
				await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
			}
		}
	}
	throw lastErr;
};

// ---- Formatters ----

const formatWebhook = (eventName, payload) => ({
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ event: eventName, ...payload }),
});

const formatSlack = (eventName, payload) => {
	const text = eventSummary(eventName, payload);
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			blocks: [
				{
					type: "section",
					text: { type: "mrkdwn", text: `*NPM Alert* — ${text}` },
				},
			],
		}),
	};
};

const formatDiscord = (eventName, payload) => {
	const text = eventSummary(eventName, payload);
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			embeds: [
				{
					title: "Nginx Proxy Manager Alert",
					description: text,
					color: eventName.includes("online") ? 3066993 : 15158332,
				},
			],
		}),
	};
};

const formatNtfy = (eventName, payload, config) => {
	const text = eventSummary(eventName, payload);
	const topic = config.topic || "nginx-proxy-manager";
	const url = config.url ? `${config.url.replace(/\/$/, "")}/${topic}` : `https://ntfy.sh/${topic}`;
	const priority = eventName.includes("online") ? 3 : 4;
	const tags = eventName.includes("online") ? ["white_check_mark"] : ["warning"];
	return {
		url,
		method: "POST",
		headers: {
			"Content-Type": "text/plain",
			Title: "NPM Alert",
			Priority: String(priority),
			Tags: tags.join(","),
		},
		body: text,
	};
};

const formatTelegram = (eventName, payload, config) => {
	const text = `*NPM Alert*\n${eventSummary(eventName, payload)}`;
	const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;
	return {
		url,
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: config.chat_id, text, parse_mode: "Markdown" }),
	};
};

const eventSummary = (eventName, payload) => {
	const domains = Array.isArray(payload.domains) ? payload.domains.join(", ") : "";
	switch (eventName) {
		case HOST_OFFLINE:
			return `Host OFFLINE: ${domains || `(id=${payload.id})`}\nError: ${payload.error || "unknown"}`;
		case HOST_ONLINE:
			return `Host back ONLINE: ${domains || `(id=${payload.id})`}`;
		case CERTIFICATE_EXPIRING:
		case CERTIFICATE_RENEWAL_FAILED:
			return `Certificate renewal FAILED: ${domains || `(id=${payload.id})`}\nError: ${payload.error || "unknown"}`;
		case UPSTREAM_DOWN:
			return `Upstream DOWN: ${domains || `(id=${payload.id})`}\nError: ${payload.error || "unknown"}`;
		case UPSTREAM_UP:
			return `Upstream recovered: ${domains || `(id=${payload.id})`}`;
		case BACKUP_OK:
			return `Backup succeeded: ${payload.destination || "local"}${payload.size ? ` (${payload.size} bytes)` : ""}`;
		case BACKUP_FAILED:
			return `Backup FAILED: ${payload.destination || "local"}\nError: ${payload.error || "unknown"}`;
		case NODE_OFFLINE:
			return `Node OFFLINE: ${payload.name || `(id=${payload.id})`}\nError: ${payload.error || "unknown"}`;
		case NODE_ONLINE:
			return `Node back ONLINE: ${payload.name || `(id=${payload.id})`}`;
		case NODE_CONFIG_FAILED:
			return `Node config apply FAILED: ${payload.name || `(id=${payload.id})`} (config v${payload.version})\nError: ${payload.error || "unknown"}`;
		default:
			return `Event: ${eventName}`;
	}
};

// ---- Send dispatch per channel type ----

const doFetch = async (url, req) => {
	if (!url) {
		throw new Error("No URL configured for this channel");
	}
	const res = await fetch(url, { method: req.method, headers: req.headers, body: req.body });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
	}
	return res;
};

const dispatch = async (channel, eventName, payload) => {
	const config = channel.config || {};
	const channelUrl = config.url || "";

	try {
		if (channel.type === "email") {
			await withRetry(() => sendEmail(config, eventName, payload));
		} else if (channel.type === "ntfy") {
			const req = formatNtfy(eventName, payload, config);
			await withRetry(() => doFetch(req.url, req));
		} else if (channel.type === "telegram") {
			const req = formatTelegram(eventName, payload, config);
			await withRetry(() => doFetch(req.url, req));
		} else {
			// webhook, slack, discord — all generic JSON POST to config.url
			let req;
			if (channel.type === "slack") req = formatSlack(eventName, payload);
			else if (channel.type === "discord") req = formatDiscord(eventName, payload);
			else req = formatWebhook(eventName, payload);

			await withRetry(() => doFetch(channelUrl, req));
		}
		return null; // success
	} catch (err) {
		return err.message || String(err);
	}
};

const sendEmail = async (config, eventName, payload) => {
	// Load SMTP from settings each time so live config changes take effect
	const smtpSetting = await settingModel.query().where("id", "smtp").first();
	const smtp = smtpSetting?.meta || {};
	if (!smtp.host) {
		throw new Error("SMTP not configured");
	}
	const transport = nodemailer.createTransport({
		host: smtp.host,
		port: smtp.port || 587,
		secure: smtp.secure || false,
		auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
	});
	const to = config.to || smtp.from;
	const subject = `NPM Alert: ${eventName}`;
	const text = eventSummary(eventName, payload);
	await transport.sendMail({ from: smtp.from, to, subject, text });
};

// ---- Event handler ----

const handleEvent = async (eventName, payload) => {
	try {
		const channels = await notificationChannelModel
			.query()
			.where("is_deleted", 0)
			.where("enabled", 1);

		for (const channel of channels) {
			const channelEvents = Array.isArray(channel.events) ? channel.events : [];
			if (!channelEvents.includes(eventName)) continue;

			if (await isDupe(channel.id, eventName, payload)) {
				logger.debug(`Skipping duplicate: channel=${channel.id} event=${eventName}`);
				continue;
			}

			const errMsg = await dispatch(channel, eventName, payload);
			if (errMsg) {
				logger.error(`Notification failed: channel=${channel.id} event=${eventName}: ${errMsg}`);
				await writeLog(channel.id, eventName, payload, "failed", errMsg);
			} else {
				logger.info(`Notification sent: channel=${channel.id} event=${eventName}`);
				await writeLog(channel.id, eventName, payload, "sent", null);
			}
		}
	} catch (err) {
		logger.error(`Notification handler error for ${eventName}:`, err.message);
	}
};

// ---- Public API ----

const internalNotification = {
	subscribe() {
		for (const eventName of ALL_EVENTS) {
			events.on(eventName, (payload) => handleEvent(eventName, payload));
		}
		logger.info("Notification dispatcher subscribed to all events");
	},

	async getChannels(access) {
		await access.can("notifications:list");
		return notificationChannelModel.query().where("is_deleted", 0).orderBy("id", "asc");
	},

	async getChannel(access, id) {
		await access.can("notifications:get");
		const row = await notificationChannelModel.query().where("id", id).where("is_deleted", 0).first();
		if (!row) {
			throw new Error(`Notification channel ${id} not found`);
		}
		return row;
	},

	async create(access, data) {
		await access.can("notifications:manage");
		return notificationChannelModel.query().insertAndFetch({
			name: data.name,
			type: data.type,
			config: data.config || {},
			events: data.events || [],
			enabled: data.enabled !== false,
		});
	},

	async update(access, id, data) {
		await access.can("notifications:manage");
		await internalNotification.getChannel(access, id);
		const patch = {};
		if (data.name !== undefined) patch.name = data.name;
		if (data.type !== undefined) patch.type = data.type;
		if (data.config !== undefined) patch.config = data.config;
		if (data.events !== undefined) patch.events = data.events;
		if (data.enabled !== undefined) patch.enabled = data.enabled;
		await notificationChannelModel.query().where("id", id).patch(patch);
		return internalNotification.getChannel(access, id);
	},

	async delete(access, id) {
		await access.can("notifications:manage");
		await internalNotification.getChannel(access, id);
		await notificationChannelModel.query().where("id", id).patch({ is_deleted: true });
		return true;
	},

	async test(access, id) {
		await access.can("notifications:manage");
		const channel = await internalNotification.getChannel(access, id);
		const payload = { id: 0, domains: ["test.example.com"], error: "Test notification" };
		const errMsg = await dispatch(channel, HOST_OFFLINE, payload);
		return { success: !errMsg, error: errMsg || null };
	},

	async getLogs(access, limit = 100) {
		await access.can("notifications:list");
		return notificationLogModel
			.query()
			.orderBy("id", "desc")
			.limit(limit);
	},
};

export default internalNotification;
