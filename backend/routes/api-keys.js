import express from "express";
import internalApiKey from "../internal/api-key.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/api-keys
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/api-keys
	 *
	 * Retrieve all API keys for the current user
	 */
	.get(async (req, res, next) => {
		try {
			const rows = await internalApiKey.getAll(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/api-keys
	 *
	 * Create a new API key. The plaintext key is only returned here, once.
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/api-keys", "post"), req.body);
			const result = await internalApiKey.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific API key
 *
 * /api/api-keys/123
 */
router
	.route("/:key_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * DELETE /api/api-keys/123
	 *
	 * Revoke an API key
	 */
	.delete(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["key_id"],
					additionalProperties: false,
					properties: {
						key_id: {
							$ref: "common#/properties/id",
						},
					},
				},
				{
					key_id: req.params.key_id,
				},
			);
			const result = await internalApiKey.delete(res.locals.access, { id: data.key_id });
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Reroll a specific API key
 *
 * /api/api-keys/123/reroll
 */
router
	.route("/:key_id/reroll")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/api-keys/123/reroll
	 *
	 * Replace the key's secret. The new plaintext key is only returned here,
	 * once. The old secret stops working immediately.
	 */
	.post(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["key_id"],
					additionalProperties: false,
					properties: {
						key_id: {
							$ref: "common#/properties/id",
						},
					},
				},
				{
					key_id: req.params.key_id,
				},
			);
			const result = await internalApiKey.reroll(res.locals.access, { id: data.key_id });
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
