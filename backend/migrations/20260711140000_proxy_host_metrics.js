import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_metrics";

/**
 * Migrate Up
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("proxy_host_metric", (table) => {
		table.increments().primary();
		table.integer("proxy_host_id").notNull().unsigned();
		table.dateTime("bucket").notNull();
		table.string("resolution", 10).notNull().defaultTo("minute");
		table.integer("requests").notNull().unsigned().defaultTo(0);
		table.bigInteger("bytes_sent").notNull().unsigned().defaultTo(0);
		table.integer("status_2xx").notNull().unsigned().defaultTo(0);
		table.integer("status_3xx").notNull().unsigned().defaultTo(0);
		table.integer("status_4xx").notNull().unsigned().defaultTo(0);
		table.integer("status_5xx").notNull().unsigned().defaultTo(0);
		table.integer("cache_hits").notNull().unsigned().defaultTo(0);
		table.index("proxy_host_id");
		table.unique(["proxy_host_id", "bucket", "resolution"]);
	});
	logger.info(`[${migrateName}] proxy_host_metric Table created`);

	await knex.schema.createTable("metric_state", (table) => {
		table.integer("proxy_host_id").primary().unsigned();
		table.bigInteger("file_offset").notNull().defaultTo(0);
		table.bigInteger("file_size").notNull().defaultTo(0);
		table.dateTime("updated_on").notNull();
	});
	logger.info(`[${migrateName}] metric_state Table created`);
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.dropTable("proxy_host_metric");
	logger.info(`[${migrateName}] proxy_host_metric Table dropped`);

	await knex.schema.dropTable("metric_state");
	logger.info(`[${migrateName}] metric_state Table dropped`);
};

export { up, down };
