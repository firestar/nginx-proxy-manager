import { migrate as logger } from "../logger.js";

const migrateName = "tags";

// Per-host-type pivot tables keep the Objection ManyToMany relations clean.
const pivotTables = ["proxy_host_tag", "redirection_host_tag", "dead_host_tag", "stream_tag"];

const pivotColumn = {
	proxy_host_tag: "proxy_host_id",
	redirection_host_tag: "redirection_host_id",
	dead_host_tag: "dead_host_id",
	stream_tag: "stream_id",
};

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

	await knex.schema.createTable("tag", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("owner_user_id").notNull().unsigned();
		table.integer("is_deleted").notNull().unsigned().defaultTo(0);
		table.string("name").notNull();
		table.string("color").notNull().defaultTo("");
		table.json("meta").notNull();
	});
	logger.info(`[${migrateName}] tag Table created`);

	for (const tableName of pivotTables) {
		const column = pivotColumn[tableName];
		await knex.schema.createTable(tableName, (table) => {
			table.increments().primary();
			table.integer("tag_id").notNull().unsigned();
			table.integer(column).notNull().unsigned();
			table.unique(["tag_id", column]);
		});
		logger.info(`[${migrateName}] ${tableName} Table created`);
	}
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	for (const tableName of pivotTables) {
		await knex.schema.dropTable(tableName);
		logger.info(`[${migrateName}] ${tableName} Table dropped`);
	}
	await knex.schema.dropTable("tag");
	logger.info(`[${migrateName}] tag Table dropped`);
};

export { up, down };
