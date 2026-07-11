import { migrate as logger } from "../logger.js";

const migrateName = "api_keys";

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

	await knex.schema.createTable("api_key", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("user_id").notNull().unsigned();
		table.string("name").notNull();
		table.string("secret_hash", 64).notNull().unique();
		table.dateTime("last_used_on").nullable();
		table.integer("is_deleted").notNull().unsigned().defaultTo(0);
	});
	logger.info(`[${migrateName}] api_key Table created`);
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.dropTable("api_key");
	logger.info(`[${migrateName}] api_key Table dropped`);
};

export { up, down };
