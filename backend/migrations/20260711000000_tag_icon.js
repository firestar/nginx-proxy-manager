import { migrate as logger } from "../logger.js";

const migrateName = "tag_icon";

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

	await knex.schema.alterTable("tag", (table) => {
		table.string("icon").notNull().defaultTo("");
	});
	logger.info(`[${migrateName}] tag.icon column added`);
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.alterTable("tag", (table) => {
		table.dropColumn("icon");
	});
	logger.info(`[${migrateName}] tag.icon column dropped`);
};

export { up, down };
