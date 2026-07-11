import crypto from "node:crypto";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import apiKeyModel from "../models/api_key.js";
import internalAuditLog from "./audit-log.js";

const omissions = () => {
	return ["is_deleted", "secret_hash"];
};

/**
 * Generate a new plaintext key. The `npm_` prefix is how the auth layer
 * distinguishes API keys from JWTs in the Authorization header.
 */
const generateSecret = () => `npm_${crypto.randomBytes(32).toString("base64url")}`;

const hashSecret = (secret) => crypto.createHash("sha256").update(secret).digest("hex");

// API keys must not be able to manage API keys, otherwise a leaked key
// could mint replacements for itself indefinitely.
const assertNotApiKey = (access) => {
	if (access.token.get("iss") === "api-key") {
		throw new errs.PermissionError("API keys cannot manage API keys");
	}
};

const internalApiKey = {
	/**
	 * Returns the new key row including the plaintext `key`, which is never
	 * retrievable again.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {String}  data.name
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		assertNotApiKey(access);
		await access.can("api_keys:create", data);

		const secret = generateSecret();
		const row = await apiKeyModel.query().insertAndFetch({
			user_id: access.token.getUserId(0),
			name: data.name,
			secret_hash: hashSecret(secret),
		});

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "api-key",
			object_id: row.id,
			meta: { name: row.name },
		});

		const result = await internalApiKey.get(access, { id: row.id });
		result.key = secret;
		return result;
	},

	/**
	 * Users can only ever see their own keys.
	 *
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Integer}  data.id
	 * @return {Promise}
	 */
	get: async (access, data) => {
		assertNotApiKey(access);
		await access.can("api_keys:get", data.id);

		const row = await apiKeyModel
			.query()
			.where("is_deleted", 0)
			.andWhere("user_id", access.token.getUserId(0))
			.andWhere("id", data.id)
			.first()
			.then(utils.omitRow(omissions()));

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		return row;
	},

	/**
	 * Replace the secret on an existing key. The old secret stops working
	 * immediately. Returns the row including the new plaintext `key`.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @returns {Promise}
	 */
	reroll: async (access, data) => {
		assertNotApiKey(access);
		await access.can("api_keys:update", data.id);

		const row = await internalApiKey.get(access, { id: data.id });

		const secret = generateSecret();
		await apiKeyModel.query().where("id", row.id).patch({ secret_hash: hashSecret(secret) });

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "api-key",
			object_id: row.id,
			meta: { name: row.name, rerolled: true },
		});

		const result = await internalApiKey.get(access, { id: row.id });
		result.key = secret;
		return result;
	},

	/**
	 * Revoke (soft-delete) a key. Requests using it fail from this point on.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		assertNotApiKey(access);
		await access.can("api_keys:delete", data.id);

		const row = await internalApiKey.get(access, { id: data.id });
		await apiKeyModel.query().where("id", row.id).patch({ is_deleted: 1 });

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "api-key",
			object_id: row.id,
			meta: { name: row.name },
		});
		return true;
	},

	/**
	 * @param   {Access}  access
	 * @returns {Promise}
	 */
	getAll: async (access) => {
		assertNotApiKey(access);
		await access.can("api_keys:list");

		return await apiKeyModel
			.query()
			.where("is_deleted", 0)
			.andWhere("user_id", access.token.getUserId(0))
			.orderBy("created_on", "DESC")
			.then(utils.omitRows(omissions()));
	},
};

export default internalApiKey;
