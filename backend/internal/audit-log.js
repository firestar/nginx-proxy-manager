import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import auditLogModel from "../models/audit-log.js";

const internalAuditLog = {

	/**
	 * All logs
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @param   {Object}  [filters]
	 * @param   {Number}  [filters.limit]
	 * @param   {Number}  [filters.offset]
	 * @param   {String}  [filters.object_type]
	 * @param   {String}  [filters.action]
	 * @param   {Number}  [filters.user_id]
	 * @param   {String}  [filters.since]
	 * @param   {String}  [filters.until]
	 * @param   {Boolean} [filters.paginated]  true when limit/offset were explicitly supplied
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery, filters = {}) => {
		await access.can("auditlog:list");

		const { paginated, limit = 100, offset = 0, object_type, action, user_id, since, until } = filters;

		const query = auditLogModel
			.query()
			.orderBy("created_on", "DESC")
			.orderBy("id", "DESC")
			.allowGraph("[user]");

		// Free-text search
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("meta"), "like", `%${searchQuery}`);
			});
		}

		// Column filters
		if (object_type) {
			query.where("object_type", object_type);
		}
		if (action) {
			query.where("action", action);
		}
		if (user_id) {
			query.where("user_id", user_id);
		}
		if (since) {
			query.where("created_on", ">=", since);
		}
		if (until) {
			query.where("created_on", "<=", until);
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		if (paginated) {
			const total = await query.clone().resultSize();
			const rows = await query.limit(limit).offset(offset);
			return { total, rows };
		}

		return await query.limit(100);
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   [data]
	 * @param  {Integer}  [data.id]          Defaults to the token user
	 * @param  {Array}    [data.expand]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		await access.can("auditlog:list");

		const query = auditLogModel
			.query()
			.andWhere("id", data.id)
			.allowGraph("[user]")
			.first();

		if (typeof data.expand !== "undefined" && data.expand !== null) {
			query.withGraphFetched(`[${data.expand.join(", ")}]`);
		}

		const row = await query;

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		return row;
	},

	/**
	 * This method should not be publicly used, it doesn't check certain things. It will be assumed
	 * that permission to add to audit log is already considered, however the access token is used for
	 * default user id determination.
	 *
	 * @param   {Access}   access
	 * @param   {Object}   data
	 * @param   {String}   data.action
	 * @param   {Number}   [data.user_id]
	 * @param   {Number}   [data.object_id]
	 * @param   {Number}   [data.object_type]
	 * @param   {Object}   [data.meta]
	 * @returns {Promise}
	 */
	add: async (access, data) => {
		if (typeof data.user_id === "undefined" || !data.user_id) {
			data.user_id = access.token.getUserId(1);
		}

		if (typeof data.action === "undefined" || !data.action) {
			throw new errs.InternalValidationError("Audit log entry must contain an Action");
		}

		// Make sure at least 1 of the IDs are set and action
		return await auditLogModel.query().insert({
			user_id: data.user_id,
			action: data.action,
			object_type: data.object_type || "",
			object_id: data.object_id || 0,
			meta: data.meta || {},
		});
	},
};

export default internalAuditLog;
