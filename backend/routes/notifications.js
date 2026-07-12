import express from "express";
import internalNotification from "../internal/notification.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET /api/notifications/channels
 */
router
	.route("/channels")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const rows = await internalNotification.getChannels(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			const result = await internalNotification.create(res.locals.access, req.body);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET/PUT/DELETE /api/notifications/channels/:id
 */
router
	.route("/channels/:id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const row = await internalNotification.getChannel(res.locals.access, Number(req.params.id));
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})
	.put(async (req, res, next) => {
		try {
			const result = await internalNotification.update(res.locals.access, Number(req.params.id), req.body);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await internalNotification.delete(res.locals.access, Number(req.params.id));
			res.status(200).send({ deleted: true });
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/notifications/channels/:id/test
 */
router
	.route("/channels/:id/test")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const result = await internalNotification.test(res.locals.access, Number(req.params.id));
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/notifications/logs
 */
router
	.route("/logs")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const limit = Math.min(Number(req.query.limit) || 100, 500);
			const rows = await internalNotification.getLogs(res.locals.access, limit);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
