import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import deadHostTagModel from "../models/dead_host_tag.js";
import proxyHostTagModel from "../models/proxy_host_tag.js";
import redirectionHostTagModel from "../models/redirection_host_tag.js";
import streamTagModel from "../models/stream_tag.js";
import tagModel from "../models/tag.js";
import internalAuditLog from "./audit-log.js";

const omissions = () => {
	return ["is_deleted"];
};

// Pivot table + FK column for each taggable host type.
const pivots = {
	proxy_host: { model: proxyHostTagModel, column: "proxy_host_id" },
	redirection_host: { model: redirectionHostTagModel, column: "redirection_host_id" },
	dead_host: { model: deadHostTagModel, column: "dead_host_id" },
	stream: { model: streamTagModel, column: "stream_id" },
};

const internalTag = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("tags:create", data);

		const row = await tagModel
			.query()
			.insertAndFetch({
				name: data.name,
				color: typeof data.color !== "undefined" ? data.color : "",
				icon: typeof data.icon !== "undefined" ? data.icon : "",
				meta: typeof data.meta !== "undefined" ? data.meta : {},
				owner_user_id: access.token.getUserId(1),
			})
			.then(utils.omitRow(omissions()));

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "tag",
			object_id: row.id,
			meta: data,
		});

		return internalTag.get(access, { id: row.id, expand: ["owner"] });
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @returns {Promise}
	 */
	update: async (access, data) => {
		await access.can("tags:update", data.id);

		const row = await internalTag.get(access, { id: data.id });
		if (row.id !== data.id) {
			throw new errs.InternalValidationError(
				`Tag could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		await tagModel
			.query()
			.where({ id: data.id })
			.patch(_.pick(data, ["name", "color", "meta"]));
			.patch(_.pick(data, ["name", "color", "icon", "meta"]));
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "tag",
			object_id: data.id,
			meta: data,
		});

		return internalTag.get(access, { id: data.id, expand: ["owner"] });
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Integer}  data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const thisData = data || {};
		await access.can("tags:get", thisData.id);

		const query = tagModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph("[owner]")
			.first();

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query.then(utils.omitRow(omissions()));
		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
			row = _.omit(row, thisData.omit);
		}
		return row;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("tags:delete", data.id);

		const row = await internalTag.get(access, { id: data.id });
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// Remove all pivot associations for this tag, then soft-delete it.
		for (const { model } of Object.values(pivots)) {
			await model.query().delete().where("tag_id", data.id);
		}

		await tagModel.query().where("id", row.id).patch({ is_deleted: 1 });

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "tag",
			object_id: row.id,
			meta: _.omit(row, ["is_deleted"]),
		});
		return true;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		await access.can("tags:list");

		const query = tagModel
			.query()
			.where("is_deleted", 0)
			.allowGraph("[owner]")
			.orderBy("name", "ASC");

		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where("name", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		return await query.then(utils.omitRows(omissions()));
	},

	/**
	 * Replace the set of tags attached to a host object. Called from host
	 * internals after create/update. Silently ignores when tagIds is undefined
	 * so hosts can be updated without touching their tags.
	 *
	 * @param   {String}   objectType  one of proxy_host, redirection_host, dead_host, stream
	 * @param   {Integer}  objectId
	 * @param   {Array}    tagIds
	 * @returns {Promise}
	 */
	setForObject: async (objectType, objectId, tagIds) => {
		if (typeof tagIds === "undefined" || tagIds === null) {
			return;
		}
		const pivot = pivots[objectType];
		if (!pivot) {
			throw new errs.InternalValidationError(`Unknown taggable object type: ${objectType}`);
		}

		const unique = [...new Set(tagIds.filter((n) => Number.isInteger(n) && n > 0))];

		await pivot.model.query().delete().where(pivot.column, objectId);
		if (unique.length) {
			await pivot.model
				.query()
				.insert(unique.map((tagId) => ({ [pivot.column]: objectId, tag_id: tagId })));
		}
	},
};

export default internalTag;
