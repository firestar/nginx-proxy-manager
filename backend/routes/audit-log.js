import express from "express";
import internalAuditLog from "../internal/audit-log.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/audit-log
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/audit-log
	 *
	 * Retrieve all logs
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						expand: {
							$ref: "common#/properties/expand",
						},
						query: {
							$ref: "common#/properties/query",
						},
						limit: {
							anyOf: [{ type: "null" }, { type: "integer", minimum: 1, maximum: 500 }],
						},
						offset: {
							anyOf: [{ type: "null" }, { type: "integer", minimum: 0 }],
						},
						object_type: {
							anyOf: [{ type: "null" }, { type: "string", minLength: 1, maxLength: 50 }],
						},
						action: {
							anyOf: [{ type: "null" }, { type: "string", minLength: 1, maxLength: 50 }],
						},
						user_id: {
							anyOf: [{ type: "null" }, { type: "integer", minimum: 1 }],
						},
						since: {
							anyOf: [{ type: "null" }, { type: "string", format: "date-time" }],
						},
						until: {
							anyOf: [{ type: "null" }, { type: "string", format: "date-time" }],
						},
					},
				},
				{
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
					query: typeof req.query.query === "string" ? req.query.query : null,
					limit: typeof req.query.limit !== "undefined" ? parseInt(req.query.limit, 10) : null,
					offset: typeof req.query.offset !== "undefined" ? parseInt(req.query.offset, 10) : null,
					object_type: typeof req.query.object_type === "string" ? req.query.object_type : null,
					action: typeof req.query.action === "string" ? req.query.action : null,
					user_id: typeof req.query.user_id !== "undefined" ? parseInt(req.query.user_id, 10) : null,
					since: typeof req.query.since === "string" ? req.query.since : null,
					until: typeof req.query.until === "string" ? req.query.until : null,
				},
			);
			const paginated = data.limit !== null || data.offset !== null;
			const filters = {
				paginated,
				limit: data.limit ?? 50,
				offset: data.offset ?? 0,
				object_type: data.object_type,
				action: data.action,
				user_id: data.user_id,
				since: data.since,
				until: data.until,
			};
			const result = await internalAuditLog.getAll(res.locals.access, data.expand, data.query, filters);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific audit log entry
 *
 * /api/audit-log/123
 */
router
	.route("/:event_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/audit-log/123
	 *
	 * Retrieve a specific entry
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["event_id"],
					additionalProperties: false,
					properties: {
						event_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					event_id: req.params.event_id,
					expand:
						typeof req.query.expand === "string"
							? req.query.expand.split(",")
							: null,
				},
			);

			const item = await internalAuditLog.get(res.locals.access, {
				id: data.event_id,
				expand: data.expand,
			});
			res.status(200).send(item);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
