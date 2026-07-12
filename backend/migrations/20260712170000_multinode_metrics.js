import { migrate as logger } from "../logger.js";

const migrateName = "multinode_metrics";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// node_id on proxy_host_metric — NULL = collected on panel (local)
	await knex.schema.alterTable("proxy_host_metric", (table) => {
		table.integer("node_id").unsigned().nullable().defaultTo(null);
		table.index("node_id");
	});
	logger.info(`[${migrateName}] node_id added to proxy_host_metric`);

	// node_id on upstream_status — NULL = checked from panel
	await knex.schema.alterTable("upstream_status", (table) => {
		table.integer("node_id").unsigned().nullable().defaultTo(null);
	});
	logger.info(`[${migrateName}] node_id added to upstream_status`);

	// node_id on uptime_event — NULL = detected from panel
	await knex.schema.alterTable("uptime_event", (table) => {
		table.integer("node_id").unsigned().nullable().defaultTo(null);
	});
	logger.info(`[${migrateName}] node_id added to uptime_event`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.alterTable("proxy_host_metric", (table) => {
		table.dropIndex("node_id");
		table.dropColumn("node_id");
	});
	await knex.schema.alterTable("upstream_status", (table) => {
		table.dropColumn("node_id");
	});
	await knex.schema.alterTable("uptime_event", (table) => {
		table.dropColumn("node_id");
	});

	logger.info(`[${migrateName}] node_id columns dropped`);
};

export { up, down };
