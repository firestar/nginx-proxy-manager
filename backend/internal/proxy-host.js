import fs from "node:fs";
import _ from "lodash";
import errs from "../lib/error.js";
import nginxLint from "./nginx-lint.js";
import proxyHeader from "./proxy-header.js";
import proxyUpstream from "./proxy-upstream.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalNode from "./node.js";
import internalTag from "./tag.js";
import { applyHostVisibility, assertTagWrite, getUserTagIds } from "../lib/host-visibility.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const internalProxyHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		// Pull tag_ids out so they aren't inserted as a column; synced separately.
		const tagIds = thisData.tag_ids;
		delete thisData.tag_ids;

		return access
			.can("proxy_hosts:create", thisData)
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
				if (typeof thisData.advanced_config === "undefined") {
					thisData.advanced_config = "";
				}

				// Reject if advanced_config duplicates a template-emitted directive.
				nginxLint.check(thisData.advanced_config, thisData);
				proxyHeader.validate(thisData.headers);
				proxyUpstream.validate(thisData.upstreams, thisData.balance_method);
				return proxyHostModel.query().insertAndFetch(thisData).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, thisData)
						.then((cert) => {
							// update host with cert id
							return internalProxyHost.update(access, {
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
				await internalTag.setForObject("proxy_host", row.id, tagIds);
				return internalProxyHost.get(access, {
					id: row.id,
					expand: ["certificate", "owner", "access_list.[clients,items]", "tags"],
				});
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(proxyHostModel, "proxy_host", row).then(() => {
					return row;
				});
			})
			.then((row) => {
				// Audit log
				thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "proxy-host",
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
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		// Pull tag_ids out so they aren't patched as a column; synced separately.
		// undefined means "don't touch tags" (e.g. internal cert-only updates).
		const tagIds = data.tag_ids;
		delete data.tag_ids;

		return access
			.can("proxy_hosts:update", thisData.id)
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
						return domain_name_check_promises.push(
							internalHost.isHostnameTaken(domain_name, "proxy", thisData.id),
						);
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
				return internalProxyHost.get(access, { id: thisData.id });
			})
			.then(async (row) => {
				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Proxy Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
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
					data,
				);

				thisData = internalHost.cleanSslHstsData(thisData, row);
				// Reject if advanced_config duplicates a template-emitted directive.
				nginxLint.check(
					typeof thisData.advanced_config !== "undefined" ? thisData.advanced_config : row.advanced_config,
					_.assign({}, row, thisData),
				);

				proxyHeader.validate(typeof thisData.headers !== "undefined" ? thisData.headers : row.headers);
				proxyUpstream.validate(
					typeof thisData.upstreams !== "undefined" ? thisData.upstreams : row.upstreams,
					typeof thisData.balance_method !== "undefined" ? thisData.balance_method : row.balance_method,
				);
				return proxyHostModel
					.query()
					.where({ id: thisData.id })
					.patch(thisData)
					.then(utils.omitRow(omissions()))
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog
							.add(access, {
								action: "updated",
								object_type: "proxy-host",
								object_id: row.id,
								meta: thisData,
							})
							.then(() => {
								return saved_row;
							});
					});
			})
			.then(async () => {
				await internalTag.setForObject("proxy_host", thisData.id, tagIds);
				return internalProxyHost
					.get(access, {
						id: thisData.id,
						expand: ["owner", "certificate", "access_list.[clients,items]", "tags"],
					})
					.then((row) => {
						if (!row.enabled) {
							// No need to add nginx config if host is disabled
							return row;
						}
						// Configure nginx
						return internalNginx.configure(proxyHostModel, "proxy_host", row).then((new_meta) => {
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
			.can("proxy_hosts:get", thisData.id)
			.then(async (access_data) => {
				const userId = access.token.getUserId(1);
				const visibility = typeof access_data === "object" ? access_data.permission_visibility : "all";
				const tagIds = visibility === "tags" ? await access.loadUserTagIds() : [];
				const query = proxyHostModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", thisData.id)
					.allowGraph(proxyHostModel.defaultAllowGraph)
					.first();

				applyHostVisibility(query, "proxy_host", { visibility, userId, tagIds });

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				const thisRow = internalHost.cleanRowCertificateMeta(row);
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(row, thisData.omit);
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
			.can("proxy_hosts:delete", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("proxy_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "proxy-host",
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
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner", "access_list"],
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

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 1,
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(proxyHostModel, "proxy_host", row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "proxy-host",
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
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Host is already disabled");
				}

				row.enabled = 0;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 0,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("proxy_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "proxy-host",
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
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("proxy_hosts:list");
		const userId = access.token.getUserId(1);
		const visibility = typeof accessData === "object" ? accessData.permission_visibility : "all";
		const tagIds = visibility === "tags" ? await access.loadUserTagIds() : [];

		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph(proxyHostModel.defaultAllowGraph)
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		applyHostVisibility(query, "proxy_host", { visibility, userId, tagIds });

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
			return internalHost.cleanAllRowsCertificateMeta(rows);
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
		const query = proxyHostModel.query().count("id as count").where("is_deleted", 0);
		const tagIds = visibility === "tags" ? await getUserTagIds(user_id) : [];
		applyHostVisibility(query, "proxy_host", { visibility, userId: user_id, tagIds });

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});
	},

	setMaintenance: (access, data) => {
		const MAINTENANCE_DIR = "/data/nginx/maintenance";
		const DEFAULT_PAGE = `${MAINTENANCE_DIR}/_default.html`;

		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner", "access_list"],
				});
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Cannot set maintenance mode on a disabled host");
				}

				row.maintenance_mode = data.enabled ? 1 : 0;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({ maintenance_mode: data.enabled ? 1 : 0 })
					.then(() => {
						fs.mkdirSync(MAINTENANCE_DIR, { recursive: true });
						if (!fs.existsSync(DEFAULT_PAGE)) {
							fs.writeFileSync(
								DEFAULT_PAGE,
								`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Maintenance</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.box{background:#fff;padding:2rem 3rem;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);text-align:center}h1{color:#e67e22}p{color:#555}</style></head><body><div class="box"><h1>&#x1F6A7; Maintenance</h1><p>This service is temporarily unavailable.<br>Please try again later.</p></div></body></html>`,
								{ encoding: "utf8" },
							);
						}
						return internalNginx.configure(proxyHostModel, "proxy_host", row);
					})
					.then(() => {
						return internalAuditLog.add(access, {
							action: "updated",
							object_type: "proxy-host",
							object_id: row.id,
							meta: { maintenance_mode: data.enabled },
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	getMaintenancePage: (access, data) => {
		const filePath = `/data/nginx/maintenance/${data.id}.html`;
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (fs.existsSync(filePath)) {
					return { html: fs.readFileSync(filePath, { encoding: "utf8" }) };
				}
				return { html: "" };
			});
	},

	setMaintenancePage: (access, data) => {
		const MAINTENANCE_DIR = "/data/nginx/maintenance";
		const filePath = `${MAINTENANCE_DIR}/${data.id}.html`;
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				fs.mkdirSync(MAINTENANCE_DIR, { recursive: true });
				if (data.html && data.html.trim().length > 0) {
					fs.writeFileSync(filePath, data.html, { encoding: "utf8" });
				} else if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
				return internalAuditLog.add(access, {
					action: "updated",
					object_type: "proxy-host",
					object_id: row.id,
					meta: { maintenance_page_set: true },
				});
			})
			.then(() => {
				return true;
			});
	},


	/**
	 * Render the saved nginx config for a proxy host without applying it.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @returns {Promise<{config: string}>}
	 */
	getConfig: async (access, data) => {
		await access.can("proxy_hosts:config", data.id);
		const row = await internalProxyHost.get(access, {
			id: data.id,
			expand: ["certificate", "access_list.[clients,items]"],
		});
		const config = await internalNginx.renderHostConfig("proxy_host", row);
		return { config };
	},

	/**
	 * Dry-run nginx -t against a candidate proxy host payload.
	 * Always restores original state; never reloads nginx.
	 *
	 * @param   {Access}  access
	 * @param   {Object}  payload  PUT-schema body plus optional id
	 * @returns {Promise<{ok: boolean, errors?: string, tested_locally?: boolean}>}
	 */
	testConfig: async (access, payload) => {
		const id = payload.id || null;
		await access.can("proxy_hosts:config", id);
		let base = {};
		if (id) {
			base = await internalProxyHost.get(access, {
				id,
				expand: ["certificate", "access_list.[clients,items]"],
			});
		}
		const candidate = _.assign({}, base, payload);
		if (!candidate.id) {
			candidate.id = 0;
		}
		const pinnedRemote = !!(candidate.node_id || candidate.node_all);
		const result = await internalNginx.testHostConfig("proxy_host", candidate);
		return pinnedRemote ? { ...result, tested_locally: true } : result;
	},

};

export default internalProxyHost;
