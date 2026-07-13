import { migrate as logger } from "../logger.js";

const migrateName = "node_apply_log";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("node_apply_log", (table) => {
		table.increments().primary();
		table.integer("node_id").notNull().unsigned().index();
		table.integer("version").notNull().unsigned();
		table.boolean("ok").notNull();
		table.text("error").nullable();
		table.dateTime("created_on").notNull();
	});

	logger.info(`[${migrateName}] node_apply_log table created`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("node_apply_log");
	logger.info(`[${migrateName}] node_apply_log table dropped`);
};

export { up, down };
