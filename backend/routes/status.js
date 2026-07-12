import express from "express";
import db from "../db.js";
import { uptimePercent } from "../internal/uptime-helpers.js";
import { express as logger, debug } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// Simple in-memory rate limiter: max 30 req per 60s per IP
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
const rateLimitStore = new Map();

const checkRateLimit = (ip) => {
	const now = Date.now();
	let record = rateLimitStore.get(ip);
	if (!record) {
		record = [];
		rateLimitStore.set(ip, record);
	}
	// Prune old timestamps
	const cutoff = now - RATE_WINDOW_MS;
	while (record.length > 0 && record[0] < cutoff) {
		record.shift();
	}
	if (record.length >= RATE_LIMIT) {
		return false;
	}
	record.push(now);
	return true;
};

// Clean up old IP records every 5 minutes
setInterval(() => {
	const cutoff = Date.now() - RATE_WINDOW_MS;
	for (const [ip, record] of rateLimitStore) {
		if (record.length === 0 || record[record.length - 1] < cutoff) {
			rateLimitStore.delete(ip);
		}
	}
}, 5 * 60 * 1000);

router
	.route("/:slug")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /status/:slug  — public, no auth
	 */
	.get(async (req, res, next) => {
		try {
			const ip = req.ip || "unknown";
			if (!checkRateLimit(ip)) {
				return res.status(429).json({ error: "Too many requests" });
			}

			const knex = db();
			const setting = await knex("setting").where("id", "status-page").first();
			if (!setting || setting.value !== "enabled") {
				return res.status(404).json({ error: "Not found" });
			}

			const meta = typeof setting.meta === "string" ? JSON.parse(setting.meta) : setting.meta;
			if (meta.slug !== req.params.slug) {
				return res.status(404).json({ error: "Not found" });
			}

			// Resolve host IDs from tag or explicit list
			let hostIds = [];
			if (meta.tag_id) {
				const rows = await knex("proxy_host_tag").where("tag_id", meta.tag_id).select("proxy_host_id");
				hostIds = rows.map((r) => r.proxy_host_id);
			} else if (Array.isArray(meta.host_ids) && meta.host_ids.length > 0) {
				hostIds = meta.host_ids;
			}

			// Load hosts (only check-enabled, non-deleted, enabled)
			let hostsQuery = knex("proxy_host").where({ is_deleted: 0, enabled: 1, check_enabled: 1 });
			if (hostIds.length > 0) {
				hostsQuery = hostsQuery.whereIn("id", hostIds);
			}
			const hosts = await hostsQuery.select("id", "domain_names");

			const now = Date.now();
			const windows = {
				d1: now - 24 * 60 * 60 * 1000,
				d7: now - 7 * 24 * 60 * 60 * 1000,
				d90: now - 90 * 24 * 60 * 60 * 1000,
			};

			const hostsOut = [];
			for (const host of hosts) {
				const status = await knex("upstream_status").where("proxy_host_id", host.id).first();
				const downEvents = await knex("uptime_event")
					.where("proxy_host_id", host.id)
					.where("status", "down")
					.select("started_on", "ended_on");

				const domainNames = typeof host.domain_names === "string" ? JSON.parse(host.domain_names) : host.domain_names;
				hostsOut.push({
					name: Array.isArray(domainNames) ? domainNames[0] : String(domainNames),
					status: status ? status.status : "unknown",
					uptime: {
						d1: uptimePercent(downEvents, windows.d1, now),
						d7: uptimePercent(downEvents, windows.d7, now),
						d90: uptimePercent(downEvents, windows.d90, now),
					},
				});
			}

			res.status(200).json({
				title: meta.title || "Service Status",
				generated_on: new Date().toISOString(),
				hosts: hostsOut,
			});
		} catch (err) {
			debug(logger, `GET /status/${req.params.slug}: ${err}`);
			next(err);
		}
	});

export default router;
