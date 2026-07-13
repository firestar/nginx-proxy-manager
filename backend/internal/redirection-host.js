import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import redirectionHostModel from "../models/redirection_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalNode from "./node.js";
import internalTag from "./tag.js";
import { applyHostVisibility, assertTagWrite, getUserTagIds } from "../lib/host-visibility.js";

const omissions = () => {
	return ["is_deleted"];
};

const internalRedirectionHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		let thisData = data || {};
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		// Pull tag_ids out so they aren't inserted as a column; synced separately.
		const tagIds = thisData.tag_ids;
		delete thisData.tag_ids;

		return access
			.can("redirection_hosts:create", thisData)
			.then(async (access_data) => {
				if (typeof access_data === "object" && access_data.permission_visibility === "tags") {
					const userTagIds = await access.loadUserTagIds();
					assertTagWrite({ visibility: "tags", tagIds: tagIds || [], userTagIds });
				}
			})
			.then(() => {
				// M1: hosts pinned to a remote node need DNS-challenge (or custom) certs
				return internalNode.assertHostAllowed(thisData.node_id, createCertificate ? "new" : thisData.certificate_id, thisData.node_all);
			})
			.then(() => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				thisData.domain_names.map((domain_name) => {
					domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
					return true;
				});

				return Promise.all(domain_name_check_promises).then((check_results) => {
					check_results.map((result) => {
						if (result.is_taken) {
							throw new errs.ValidationError(`${result.hostname} is already in use`);
						}
						return true;
					});
				});
			})
			.then(() => {
				// At this point the domains should have been checked
				thisData.owner_user_id = access.token.getUserId(1);
				thisData = internalHost.cleanSslHstsData(thisData);

				// Fix for db field not having a default value
				// for this optional field.
				if (typeof data.advanced_config === "undefined") {
					data.advanced_config = "";
				}

				return redirectionHostModel.query().insertAndFetch(thisData).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, thisData)
						.then((cert) => {
							// update host with cert id
							return internalRedirectionHost.update(access, {
								id: row.id,
								certificate_id: cert.id,
							});
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then(async (row) => {
				// Sync tags then re-fetch with cert + tags
				await internalTag.setForObject("redirection_host", row.id, tagIds);
				return internalRedirectionHost.get(access, {
					id: row.id,
					expand: ["certificate", "owner", "tags"],
				});
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(redirectionHostModel, "redirection_host", row).then(() => {
					return row;
				});
			})
			.then((row) => {
				thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "redirection-host",
						object_id: row.id,
						meta: thisData,
					})
					.then(() => {
						return row;
					});
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		let thisData = data || {};
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		// Pull tag_ids out so they aren't patched as a column; synced separately.
		const tagIds = thisData.tag_ids;
		delete thisData.tag_ids;

		return access
			.can("redirection_hosts:update", thisData.id)
			.then(async (access_data) => {
				if (typeof tagIds !== "undefined" && tagIds !== null && typeof access_data === "object" && access_data.permission_visibility === "tags") {
					const userTagIds = await access.loadUserTagIds();
					assertTagWrite({ visibility: "tags", tagIds, userTagIds });
				}
			})
			.then(() => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				if (typeof thisData.domain_names !== "undefined") {
					thisData.domain_names.map((domain_name) => {
						domain_name_check_promises.push(
							internalHost.isHostnameTaken(domain_name, "redirection", thisData.id),
						);
						return true;
					});

					return Promise.all(domain_name_check_promises).then((check_results) => {
						check_results.map((result) => {
							if (result.is_taken) {
								throw new errs.ValidationError(`${result.hostname} is already in use`);
							}
							return true;
						});
					});
				}
			})
			.then(() => {
				return internalRedirectionHost.get(access, { id: thisData.id });
			})
			.then(async (row) => {
				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Redirection Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
					);
				}

				// M1: hosts pinned to a remote node need DNS-challenge (or custom) certs
				await internalNode.assertHostAllowed(
					thisData.node_id !== undefined ? thisData.node_id : row.node_id,
					createCertificate ? "new" : thisData.certificate_id !== undefined ? thisData.certificate_id : row.certificate_id,
					thisData.node_all !== undefined ? thisData.node_all : row.node_all,
				);
				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, {
							domain_names: thisData.domain_names || row.domain_names,
							meta: _.assign({}, row.meta, thisData.meta),
						})
						.then((cert) => {
							// update host with cert id
							thisData.certificate_id = cert.id;
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then((row) => {
				// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
				thisData = _.assign(
					{},
					{
						domain_names: row.domain_names,
					},
					thisData,
				);

				thisData = internalHost.cleanSslHstsData(thisData, row);

				return redirectionHostModel
					.query()
					.where({ id: thisData.id })
					.patch(thisData)
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog
							.add(access, {
								action: "updated",
								object_type: "redirection-host",
								object_id: row.id,
								meta: thisData,
							})
							.then(() => {
								return _.omit(saved_row, omissions());
							});
					});
			})
			.then(async () => {
				await internalTag.setForObject("redirection_host", thisData.id, tagIds);
				return internalRedirectionHost
					.get(access, {
						id: thisData.id,
						expand: ["owner", "certificate", "tags"],
					})
					.then((row) => {
						// Configure nginx
						return internalNginx
							.configure(redirectionHostModel, "redirection_host", row)
							.then((new_meta) => {
								row.meta = new_meta;
								return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
							});
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		const thisData = data || {};
		return access
			.can("redirection_hosts:get", thisData.id)
			.then(async (access_data) => {
				const userId = access.token.getUserId(1);
				const visibility = typeof access_data === "object" ? access_data.permission_visibility : "all";
				const tagIds = visibility === "tags" ? await access.loadUserTagIds() : [];
				const query = redirectionHostModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", thisData.id)
					.allowGraph(redirectionHostModel.defaultAllowGraph)
					.first();

				applyHostVisibility(query, "redirection_host", { visibility, userId, tagIds });

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				let thisRow = row;
				if (!thisRow?.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				thisRow = internalHost.cleanRowCertificateMeta(thisRow);
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(thisRow, thisData.omit);
				}
				return thisRow;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access
			.can("redirection_hosts:delete", data.id)
			.then(() => {
				return internalRedirectionHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return redirectionHostModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("redirection_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "redirection-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: (access, data) => {
		return access
			.can("redirection_hosts:update", data.id)
			.then(() => {
				return internalRedirectionHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner"],
				});
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (row.enabled) {
					throw new errs.ValidationError("Host is already enabled");
				}

				row.enabled = 1;

				return redirectionHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 1,
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(redirectionHostModel, "redirection_host", row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "redirection-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: (access, data) => {
		return access
			.can("redirection_hosts:update", data.id)
			.then(() => {
				return internalRedirectionHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Host is already disabled");
				}

				row.enabled = 0;

				return redirectionHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 0,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("redirection_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "redirection-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access
			.can("redirection_hosts:list")
			.then(async (access_data) => {
				const userId = access.token.getUserId(1);
				const visibility = typeof access_data === "object" ? access_data.permission_visibility : "all";
				const tagIds = visibility === "tags" ? await access.loadUserTagIds() : [];
				const query = redirectionHostModel
					.query()
					.where("is_deleted", 0)
					.groupBy("id")
					.allowGraph(redirectionHostModel.defaultAllowGraph)
					.orderBy(castJsonIfNeed("domain_names"), "ASC");

				applyHostVisibility(query, "redirection_host", { visibility, userId, tagIds });

				// Query is used for searching
				if (typeof search_query === "string" && search_query.length > 0) {
					query.where(function () {
						this.where(castJsonIfNeed("domain_names"), "like", `%${search_query}%`);
					});
				}

				if (typeof expand !== "undefined" && expand !== null) {
					query.withGraphFetched(`[${expand.join(", ")}]`);
				}

				return query.then(utils.omitRows(omissions()));
			})
			.then((rows) => {
				if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
					return internalHost.cleanAllRowsCertificateMeta(rows);
				}

				return rows;
			});
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility) => {
		const query = redirectionHostModel.query().count("id as count").where("is_deleted", 0);
		const tagIds = visibility === "tags" ? await getUserTagIds(user_id) : [];
		applyHostVisibility(query, "redirection_host", { visibility, userId: user_id, tagIds });

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});

	},
	getConfig: async (access, data) => {
		await access.can("redirection_hosts:config", data.id);
		const row = await internalRedirectionHost.get(access, {
			id: data.id,
			expand: ["certificate"],
		});
		const config = await internalNginx.renderHostConfig("redirection_host", row);
		return { config };
	},

	testConfig: async (access, payload) => {
		const id = payload.id || null;
		await access.can("redirection_hosts:config", id);
		let base = {};
		if (id) {
			base = await internalRedirectionHost.get(access, { id, expand: ["certificate"] });
		}
		const candidate = _.assign({}, base, payload);
		if (!candidate.id) {
			candidate.id = 0;
		}
		const pinnedRemote = !!(candidate.node_id || candidate.node_all);
		const result = await internalNginx.testHostConfig("redirection_host", candidate);
		return pinnedRemote ? { ...result, tested_locally: true } : result;
	},

};

export default internalRedirectionHost;
