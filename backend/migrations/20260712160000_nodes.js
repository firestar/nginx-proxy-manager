import { migrate as logger } from "../logger.js";

const migrateName = "nodes";

const hostTables = ["proxy_host", "redirection_host", "dead_host", "stream"];

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("node", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("is_deleted").notNull().unsigned().defaultTo(0);
		table.string("name", 100).notNull();
		// sha256 hex of the current credential: the one-time enrollment token,
		// replaced by the per-node key hash after enrollment.
		table.string("token_hash", 64).notNull();
		table.string("status", 16).notNull().defaultTo("pending");
		table.dateTime("last_seen").nullable();
		table.string("version", 32).nullable();
		table.integer("config_version").notNull().unsigned().defaultTo(0);
		table.json("meta");
	});
	logger.info(`[${migrateName}] node Table created`);

	for (const tableName of hostTables) {
		await knex.schema.alterTable(tableName, (table) => {
			// NULL = local node (existing behavior)
			table.integer("node_id").unsigned().nullable().defaultTo(null);
		});
	}
	logger.info(`[${migrateName}] node_id columns added to host tables`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	for (const tableName of hostTables) {
		await knex.schema.alterTable(tableName, (table) => {
			table.dropColumn("node_id");
		});
	}
	await knex.schema.dropTableIfExists("node");

	logger.info(`[${migrateName}] Tables dropped`);
};

export { up, down };
