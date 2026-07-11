import { migrate as logger } from "../logger.js";

const migrateName = "api_key_scopes";

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

	// JSON array of "resource:level" strings. NULL means the key is
	// unrestricted and acts with the owning user's full permissions.
	await knex.schema.alterTable("api_key", (table) => {
		table.text("scopes").nullable();
	});
	logger.info(`[${migrateName}] api_key.scopes column added`);
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.alterTable("api_key", (table) => {
		table.dropColumn("scopes");
	});
	logger.info(`[${migrateName}] api_key.scopes column dropped`);
};

export { up, down };
