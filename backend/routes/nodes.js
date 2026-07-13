import express from "express";
import internalNode from "../internal/node.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET/POST /api/nodes
 */
router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const rows = await internalNode.getAll(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			const result = await internalNode.create(res.locals.access, req.body);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET/PUT/DELETE /api/nodes/:id
 */
router
	.route("/:id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const row = await internalNode.get(res.locals.access, Number(req.params.id));
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})
	.put(async (req, res, next) => {
		try {
			const result = await internalNode.update(res.locals.access, Number(req.params.id), req.body);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await internalNode.delete(res.locals.access, Number(req.params.id));
			res.status(200).send({ deleted: true });
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/nodes/:id/token — invalidate credential, issue new one-time token
 */
router
	.route("/:id/token")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const result = await internalNode.regenerateToken(res.locals.access, Number(req.params.id));
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});


/**
 * POST /api/nodes/:id/sync — force an immediate push to the node
 */
router
	.route("/:id/sync")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await internalNode.sync(res.locals.access, Number(req.params.id));
			res.status(202).send({ ok: true });
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/nodes/:id/apply-log?limit=
 */
router
	.route("/:id/apply-log")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const rows = await internalNode.getApplyLog(
				res.locals.access,
				Number(req.params.id),
				req.query.limit,
			);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});
export default router;
