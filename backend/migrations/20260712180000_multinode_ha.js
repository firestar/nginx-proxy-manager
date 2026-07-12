import { migrate as logger } from "../logger.js";

const migrateName = "multinode_ha";

const hostTables = ["proxy_host", "redirection_host", "dead_host", "stream"];

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	for (const tableName of hostTables) {
		await knex.schema.alterTable(tableName, (table) => {
			// 1 = replicate this host to every enrolled node (HA). Mutually
			// exclusive with node_id (single-pin); node_id is cleared when set.
			table.integer("node_all").notNull().unsigned().defaultTo(0);
		});
	}
	logger.info(`[${migrateName}] node_all columns added to host tables`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	for (const tableName of hostTables) {
		await knex.schema.alterTable(tableName, (table) => {
			table.dropColumn("node_all");
		});
	}

	logger.info(`[${migrateName}] node_all columns dropped`);
};

export { up, down };
