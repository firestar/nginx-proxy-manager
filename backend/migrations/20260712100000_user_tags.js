import { migrate as logger } from "../logger.js";

const migrateName = "user_tags";

/**
 * Migrate Up
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("user_tag", (table) => {
		table.increments().primary();
		table.integer("user_id").notNull().unsigned();
		table.integer("tag_id").notNull().unsigned();
		table.dateTime("created_on").notNull();
		table.unique(["user_id", "tag_id"]);
	});
	logger.info(`[${migrateName}] user_tag Table created`);
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTable("user_tag");
	logger.info(`[${migrateName}] user_tag Table dropped`);
};

export { up, down };
