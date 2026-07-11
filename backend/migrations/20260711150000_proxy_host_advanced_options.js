import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_advanced_options";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.string("client_max_body_size").nullable().defaultTo(null);
			table.integer("proxy_connect_timeout").nullable().defaultTo(null);
			table.integer("proxy_send_timeout").nullable().defaultTo(null);
			table.integer("proxy_read_timeout").nullable().defaultTo(null);
			table.string("proxy_buffering").nullable().defaultTo(null);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.dropColumn("client_max_body_size");
			table.dropColumn("proxy_connect_timeout");
			table.dropColumn("proxy_send_timeout");
			table.dropColumn("proxy_read_timeout");
			table.dropColumn("proxy_buffering");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
