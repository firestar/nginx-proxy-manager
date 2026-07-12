import fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { debug, nginx as logger } from "../logger.js";
import events, { HOST_OFFLINE, HOST_ONLINE } from "../lib/events.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const internalNginx = {
	/**
	 * Filter nginx test output to fatal lines only ([emerg]/[crit]).
	 * Drops [warn] noise and the docker /var/log/nginx/error.log false-positive.
	 * Falls back to all non-false-positive lines if no fatal line found.
	 *
	 * @param   {String} msg
	 * @returns {String}
	 */
	filterFatalLines: (msg) => {
		const lines = msg.split("\n").filter((l) => l.indexOf("/var/log/nginx/error.log") === -1);
		const fatal = lines.filter((l) => l.includes("[emerg]") || l.includes("[crit]"));
		return (fatal.length ? fatal : lines).join("\n").trim();
	},

	/**
	 * Safe apply: backup existing config, write candidate, test.
	 * On success: remove backup, patch meta online, reload.
	 * On failure: restore backup (or delete if new host), patch meta offline,
	 *             do NOT reload, throw ValidationError with fatal lines.
	 *
	 * @param   {Object|String}  model
	 * @param   {String}         host_type
	 * @param   {Object}         host
	 * @returns {Promise}
	 */
	configure: async (model, host_type, host) => {
		// Hosts pinned to a remote node are rendered and pushed to the agent over
		// WebSocket; the agent stages, tests and acks. Nothing changes locally.
		if (host.node_id || host.node_all) {
			const { default: internalNode } = await import("./node.js");
			return internalNode.applyRemoteHost(model, host_type, host);
		}
		// 1. Baseline: global nginx must be OK before we touch anything.
		await internalNginx.test();

		const wasOnline = host.meta?.nginx_online;
		const filename = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			host.id,
		);
		const bakFile = `${filename}.bak`;
		const existed = fs.existsSync(filename);

		// 2. Backup existing config so we can restore on failure.
		if (existed) {
			fs.copyFileSync(filename, bakFile);
		}

		// 3. Write candidate config.
		await internalNginx.generateConfig(host_type, host);

		// 4. Test candidate.
		try {
			await internalNginx.test();
		} catch (testErr) {
			// Restore previous working config (or remove if this was a new host).
			if (existed) {
				try {
					fs.renameSync(bakFile, filename);
				} catch (_) {
					// best-effort
				}
			} else {
				internalNginx.deleteFile(filename);
			}

			const fatalMsg = internalNginx.filterFatalLines(testErr.message);
			debug(logger, "Nginx test failed (config restored):", fatalMsg);

			const combined_meta = _.assign({}, host.meta, {
				nginx_online: false,
				nginx_err: fatalMsg,
			});
			await model.query().where("id", host.id).patch({ meta: combined_meta });
			if (wasOnline !== false) {
				events.emit(HOST_OFFLINE, { host_type, id: host.id, domains: host.domain_names || [], error: fatalMsg });
			}

			throw new errs.ValidationError(fatalMsg);
		}

		// 5. Success: remove backup, update meta, reload.
		if (existed) {
			try {
				fs.unlinkSync(bakFile);
			} catch (_) {
				// best-effort
			}
		}

		const combined_meta = _.assign({}, host.meta, {
			nginx_online: true,
			nginx_err: null,
		});
		await model.query().where("id", host.id).patch({ meta: combined_meta });
		if (wasOnline === false) {
			events.emit(HOST_ONLINE, { host_type, id: host.id, domains: host.domain_names || [] });
		}
		await internalNginx.reload();

		return combined_meta;
	},

	/**
	 * @returns {Promise}
	 */
	test: () => {
		debug(logger, "Testing Nginx configuration");
		return utils.execFile("/usr/sbin/nginx", ["-t", "-g", "error_log off;"]);
	},

	/**
	 * @returns {Promise}
	 */
	reload: () => {
		return internalNginx.test().then(() => {
			logger.info("Reloading Nginx");
			return utils.execFile("/usr/sbin/nginx", ["-s", "reload"]);
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Integer} host_id
	 * @returns {String}
	 */
	getConfigName: (host_type, host_id) => {
		if (host_type === "default") {
			return "/data/nginx/default_host/site.conf";
		}
		return `/data/nginx/${internalNginx.getFileFriendlyHostType(host_type)}/${host_id}.conf`;
	},

	/**
	 * Generates custom locations
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	renderLocations: (host) => {
		return new Promise((resolve, reject) => {
			let template;

			try {
				template = fs.readFileSync(`${__dirname}/../templates/_location.conf`, { encoding: "utf8" });
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			const renderEngine = utils.getRenderEngine();
			let renderedLocations = "";

			const locationRendering = async () => {
				for (let i = 0; i < host.locations.length; i++) {
					const locationCopy = Object.assign(
						{},
						{ access_list_id: host.access_list_id },
						{ certificate_id: host.certificate_id },
						{ ssl_forced: host.ssl_forced },
						{ caching_enabled: host.caching_enabled },
						{ block_exploits: host.block_exploits },
						{ allow_websocket_upgrade: host.allow_websocket_upgrade },
						{ http2_support: host.http2_support },
						{ hsts_enabled: host.hsts_enabled },
						{ hsts_subdomains: host.hsts_subdomains },
						{ access_list: host.access_list },
						{ certificate: host.certificate },
						host.locations[i],
					);

					if (locationCopy.forward_host.indexOf("/") > -1) {
						const splitted = locationCopy.forward_host.split("/");

						locationCopy.forward_host = splitted.shift();
						locationCopy.forward_path = `/${splitted.join("/")}`;
					}

					renderedLocations += await renderEngine.parseAndRender(template, locationCopy);
				}
			};

			locationRendering().then(() => resolve(renderedLocations));
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host_row
	 * @param   {Object}  [extra]      Extra template context (e.g. acme_relay_url for remote-node snapshots)
	 * @returns {Promise<String>}
	 */
	renderConfig: async (host_type, host_row, extra) => {
		// Prevent modifying the original object:
		const host = JSON.parse(JSON.stringify(host_row));
		if (extra) {
			Object.assign(host, extra);
		}
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);

		const renderEngine = utils.getRenderEngine();
		let template;
		try {
			template = fs.readFileSync(`${__dirname}/../templates/${nice_host_type}.conf`, { encoding: "utf8" });
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}

		// Manipulate the data a bit before sending it to the template
		if (nice_host_type !== "default") {
			host.use_default_location = true;
			if (typeof host.advanced_config !== "undefined" && host.advanced_config) {
				host.use_default_location = !internalNginx.advancedConfigHasDefaultLocation(host.advanced_config);
			}
		}

		// For redirection hosts, if the scheme is not http or https, set it to $scheme
		if (nice_host_type === "redirection_host" && ["http", "https"].indexOf(host.forward_scheme.toLowerCase()) === -1) {
			host.forward_scheme = "$scheme";
		}

		if (host.locations) {
			// Allow someone who is using / custom location path to use it, and skip the default / location
			_.map(host.locations, (location) => {
				if (location.path === "/") {
					host.use_default_location = false;
				}
			});
			host.locations = await internalNginx.renderLocations(host);
		}

		// Set the IPv6 setting for the host
		host.ipv6 = internalNginx.ipv6Enabled();

		return renderEngine.parseAndRender(template, host);
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host_row
	 * @returns {Promise}
	 */
	generateConfig: async (host_type, host_row) => {
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);
		debug(logger, `Generating ${nice_host_type} Config:`, JSON.stringify(host_row, null, 2));

		const filename = internalNginx.getConfigName(nice_host_type, host_row.id);
		const config_text = await internalNginx.renderConfig(host_type, host_row);

		try {
			fs.writeFileSync(filename, config_text, { encoding: "utf8" });
			debug(logger, "Wrote config:", filename, config_text);
		} catch (err) {
			debug(logger, `Could not write ${filename}:`, err.message);
			throw new errs.ConfigurationError(err.message);
		}
		return true;
	},

	/**
	 * This generates a temporary nginx config listening on port 80 for the domain names listed
	 * in the certificate setup. It allows the letsencrypt acme challenge to be requested by letsencrypt
	 * when requesting a certificate without having a hostname set up already.
	 *
	 * @param   {Object}  certificate
	 * @returns {Promise}
	 */
	generateLetsEncryptRequestConfig: (certificate) => {
		debug(logger, "Generating LetsEncrypt Request Config:", certificate);
		const renderEngine = utils.getRenderEngine();

		return new Promise((resolve, reject) => {
			let template = null;
			const filename = `/data/nginx/temp/letsencrypt_${certificate.id}.conf`;

			try {
				template = fs.readFileSync(`${__dirname}/../templates/letsencrypt-request.conf`, { encoding: "utf8" });
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			certificate.ipv6 = internalNginx.ipv6Enabled();

			renderEngine
				.parseAndRender(template, certificate)
				.then((config_text) => {
					fs.writeFileSync(filename, config_text, { encoding: "utf8" });
					debug(logger, "Wrote config:", filename, config_text);
					resolve(true);
				})
				.catch((err) => {
					debug(logger, `Could not write ${filename}:`, err.message);
					reject(new errs.ConfigurationError(err.message));
				});
		});
	},

	/**
	 * A simple wrapper around unlinkSync that writes to the logger
	 *
	 * @param   {String}  filename
	 */
	deleteFile: (filename) => {
		if (!fs.existsSync(filename)) {
			return;
		}
		try {
			debug(logger, `Deleting file: ${filename}`);
			fs.unlinkSync(filename);
		} catch (err) {
			debug(logger, "Could not delete file:", JSON.stringify(err, null, 2));
		}
	},

	/**
	 *
	 * @param   {String} host_type
	 * @returns String
	 */
	getFileFriendlyHostType: (host_type) => {
		return host_type.replace(/-/g, "_");
	},

	/**
	 * This removes the temporary nginx config file generated by `generateLetsEncryptRequestConfig`
	 *
	 * @param   {Object}  certificate
	 * @returns {Promise}
	 */
	deleteLetsEncryptRequestConfig: (certificate) => {
		const config_file = `/data/nginx/temp/letsencrypt_${certificate.id}.conf`;
		return new Promise((resolve /*, reject*/) => {
			internalNginx.deleteFile(config_file);
			resolve();
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @param   {Boolean} [delete_err_file]
	 * @returns {Promise}
	 */
	deleteConfig: (host_type, host, delete_err_file) => {
		// Hosts on a remote node have no local config file; the next full-state
		// snapshot push (which omits the host) removes it on the agent.
		if (host?.node_id || host?.node_all) {
			return import("./node.js").then(({ default: internalNode }) => {
				internalNode.scheduleHostPush(host);
			});
		}
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);
		const config_file_err = `${config_file}.err`;

		return new Promise((resolve /*, reject*/) => {
			internalNginx.deleteFile(config_file);
			if (delete_err_file) {
				internalNginx.deleteFile(config_file_err);
			}
			resolve();
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	renameConfigAsError: (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);
		const config_file_err = `${config_file}.err`;

		return new Promise((resolve /*, reject*/) => {
			fs.unlink(config_file, () => {
				// ignore result, continue
				fs.rename(config_file, config_file_err, () => {
					// also ignore result, as this is a debugging informative file anyway
					resolve();
				});
			});
		});
	},

	/**
	 * @param   {String}  hostType
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkGenerateConfigs: async (hostType, hosts) => {
		const promises = [];
		const nodeIds = new Set();
		let pushAll = false;
		hosts.map((host) => {
			if (host.node_all) {
				// Replicated host: re-push every enrolled node.
				pushAll = true;
			} else if (host.node_id) {
				// Remote host: re-push the node's snapshot instead of writing locally
				// (this is how cert renewals and access-list changes reach agents).
				nodeIds.add(host.node_id);
			} else {
				promises.push(internalNginx.generateConfig(hostType, host));
			}
			return true;
		});

		if (pushAll || nodeIds.size) {
			const { default: internalNode } = await import("./node.js");
			if (pushAll) {
				internalNode.schedulePushAll();
			} else {
				for (const nodeId of nodeIds) {
					internalNode.schedulePush(nodeId);
				}
			}
		}

		return Promise.all(promises);
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkDeleteConfigs: (host_type, hosts) => {
		const promises = [];
		hosts.map((host) => {
			promises.push(internalNginx.deleteConfig(host_type, host, true));
			return true;
		});

		return Promise.all(promises);
	},

	/**
	 * @param   {string}  config
	 * @returns {boolean}
	 */
	advancedConfigHasDefaultLocation: (cfg) => !!cfg.match(/^(?:.*;)?\s*?location\s*?\/\s*?{/im),

	/**
	 * @returns {boolean}
	 */
	ipv6Enabled: () => {
		if (typeof process.env.DISABLE_IPV6 !== "undefined") {
			const disabled = process.env.DISABLE_IPV6.toLowerCase();
			return !(disabled === "on" || disabled === "true" || disabled === "1" || disabled === "yes");
		}

		return true;
	},
};

export default internalNginx;
