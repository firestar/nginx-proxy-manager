import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import deadHostModel from "../models/dead_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalTag from "./tag.js";
import { applyHostVisibility, assertTagWrite, getUserTagIds } from "../lib/host-visibility.js";

const omissions = () => {
	return ["is_deleted"];
};

const internalDeadHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		const createCertificate = data.certificate_id === "new";

		if (createCertificate) {
			delete data.certificate_id;
		}

		// Pull tag_ids out so they aren't inserted as a column; synced separately.
		const tagIds = data.tag_ids;
		delete data.tag_ids;

		const createAccessData = await access.can("dead_hosts:create", data);
		if (typeof createAccessData === "object" && createAccessData.permission_visibility === "tags") {
			const userTagIds = await access.loadUserTagIds();
			assertTagWrite({ visibility: "tags", tagIds: tagIds || [], userTagIds });
		}

		// Get a list of the domain names and check each of them against existing records
		const domainNameCheckPromises = [];

		data.domain_names.map((domain_name) => {
			domainNameCheckPromises.push(internalHost.isHostnameTaken(domain_name));
			return true;
		});

		await Promise.all(domainNameCheckPromises).then((check_results) => {
			check_results.map((result) => {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
				return true;
			});
		});

		// At this point the domains should have been checked
		data.owner_user_id = access.token.getUserId(1);
		const thisData = internalHost.cleanSslHstsData(data);

		// Fix for db field not having a default value
		// for this optional field.
		if (typeof data.advanced_config === "undefined") {
			thisData.advanced_config = "";
		}

		const row = await deadHostModel.query()
			.insertAndFetch(thisData)
			.then(utils.omitRow(omissions()));

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "dead-host",
			object_id: row.id,
			meta: thisData,
		});

		if (createCertificate) {
			const cert = await internalCertificate.createQuickCertificate(access, data);

			// update host with cert id
			await internalDeadHost.update(access, {
				id: row.id,
				certificate_id: cert.id,
			});
		}

		// Sync tags then re-fetch with cert + tags
		await internalTag.setForObject("dead_host", row.id, tagIds);
		const freshRow = await internalDeadHost.get(access, {
			id: row.id,
			expand: ["certificate", "owner", "tags"],
		});

		// Sanity check
		if (createCertificate && !freshRow.certificate_id) {
			throw new errs.InternalValidationError("The host was created but the Certificate creation failed.");
		}

		// Configure nginx
		await internalNginx.configure(deadHostModel, "dead_host", freshRow);

		return freshRow;
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: async (access, data) => {
		const createCertificate = data.certificate_id === "new";
		if (createCertificate) {
			delete data.certificate_id;
		}

		// Pull tag_ids out so they aren't patched as a column; synced separately.
		const tagIds = data.tag_ids;
		delete data.tag_ids;

		const updateAccessData = await access.can("dead_hosts:update", data.id);
		if (typeof tagIds !== "undefined" && tagIds !== null && typeof updateAccessData === "object" && updateAccessData.permission_visibility === "tags") {
			const userTagIds = await access.loadUserTagIds();
			assertTagWrite({ visibility: "tags", tagIds, userTagIds });
		}

		// Get a list of the domain names and check each of them against existing records
		const domainNameCheckPromises = [];
		if (typeof data.domain_names !== "undefined") {
			data.domain_names.map((domainName) => {
				domainNameCheckPromises.push(internalHost.isHostnameTaken(domainName, "dead", data.id));
				return true;
			});

			const checkResults = await Promise.all(domainNameCheckPromises);
			checkResults.map((result) => {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
				return true;
			});
		}
		const row = await internalDeadHost.get(access, { id: data.id });

		if (row.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`404 Host could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		if (createCertificate) {
			const cert = await internalCertificate.createQuickCertificate(access, {
				domain_names: data.domain_names || row.domain_names,
				meta: _.assign({}, row.meta, data.meta),
			});

			// update host with cert id
			data.certificate_id = cert.id;
		}

		// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
		let thisData = _.assign(
			{},
			{
				domain_names: row.domain_names,
			},
			data,
		);

		thisData = internalHost.cleanSslHstsData(thisData, row);


		// do the row update
		await deadHostModel
			.query()
			.where({id: data.id})
			.patch(data);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "dead-host",
			object_id: row.id,
			meta: thisData,
		});

		await internalTag.setForObject("dead_host", thisData.id, tagIds);
		const thisRow = await internalDeadHost
			.get(access, {
				id: thisData.id,
				expand: ["owner", "certificate", "tags"],
			});

		// Configure nginx
		const newMeta = await internalNginx.configure(deadHostModel, "dead_host", row);
		row.meta = newMeta;
		return _.omit(internalHost.cleanRowCertificateMeta(thisRow), omissions());
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const accessData = await access.can("dead_hosts:get", data.id);
		const userId = access.token.getUserId(1);
		const visibility = typeof accessData === "object" ? accessData.permission_visibility : "all";
		const tagIds = visibility === "tags" ? await access.loadUserTagIds() : [];
		const query = deadHostModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", data.id)
			.allowGraph(deadHostModel.defaultAllowGraph)
			.first();

		applyHostVisibility(query, "dead_host", { visibility, userId, tagIds });

		if (typeof data.expand !== "undefined" && data.expand !== null) {
			query.withGraphFetched(`[${data.expand.join(", ")}]`);
		}

		const row = await query.then(utils.omitRow(omissions()));
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		// Custom omissions
		if (typeof data.omit !== "undefined" && data.omit !== null) {
			return _.omit(row, data.omit);
		}
		return row;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("dead_hosts:delete", data.id)
		const row = await internalDeadHost.get(access, { id: data.id });
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		await deadHostModel
			.query()
			.where("id", row.id)
			.patch({
				is_deleted: 1,
			});

		// Delete Nginx Config
		await internalNginx.deleteConfig("dead_host", row);
		await internalNginx.reload();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: async (access, data) => {
		await access.can("dead_hosts:update", data.id)
		const row = await internalDeadHost.get(access, {
			id: data.id,
			expand: ["certificate", "owner"],
		});
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}

		row.enabled = 1;

		await deadHostModel
			.query()
			.where("id", row.id)
			.patch({
				enabled: 1,
			});

		// Configure nginx
		await internalNginx.configure(deadHostModel, "dead_host", row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: async (access, data) => {
		await access.can("dead_hosts:update", data.id)
		const row = await internalDeadHost.get(access, { id: data.id });
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Host is already disabled");
		}

		row.enabled = 0;

		await deadHostModel
			.query()
			.where("id", row.id)
			.patch({
				enabled: 0,
			});

		// Delete Nginx Config
		await internalNginx.deleteConfig("dead_host", row);
		await internalNginx.reload();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * All Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("dead_hosts:list");
		const userId = access.token.getUserId(1);
		const visibility = typeof accessData === "object" ? accessData.permission_visibility : "all";
		const tagIds = visibility === "tags" ? await access.loadUserTagIds() : [];
		const query = deadHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph(deadHostModel.defaultAllowGraph)
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		applyHostVisibility(query, "dead_host", { visibility, userId, tagIds });

		// Query is used for searching
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("domain_names"), "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
			internalHost.cleanAllRowsCertificateMeta(rows);
		}
		return rows;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility) => {
		const query = deadHostModel.query().count("id as count").where("is_deleted", 0);
		const tagIds = visibility === "tags" ? await getUserTagIds(user_id) : [];
		applyHostVisibility(query, "dead_host", { visibility, userId: user_id, tagIds });

		const row = await query.first();
		return Number.parseInt(row.count, 10);
	},
};

export default internalDeadHost;
