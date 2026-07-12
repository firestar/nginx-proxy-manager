import { migrate as logger } from "../logger.js";

const migrateName = "uptime";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.alterTable("proxy_host", (table) => {
		table.boolean("check_enabled").notNullable().defaultTo(false);
		table.string("check_path", 1024).notNullable().defaultTo("/");
		table.integer("check_interval_s").notNullable().unsigned().defaultTo(60);
		table.string("expected_status", 128).notNullable().defaultTo("200-399");
	});
	logger.info(`[${migrateName}] proxy_host columns added`);

	await knex.schema.createTable("upstream_status", (table) => {
		table.integer("proxy_host_id").primary().unsigned();
		table.string("status", 10).notNullable().defaultTo("up");
		table.integer("latency_ms").unsigned().nullable();
		table.text("last_error").nullable();
		table.dateTime("since").nullable();
		table.dateTime("last_checked").nullable();
	});
	logger.info(`[${migrateName}] upstream_status Table created`);

	await knex.schema.createTable("uptime_event", (table) => {
		table.increments().primary();
		table.integer("proxy_host_id").notNull().unsigned();
		table.string("status", 10).notNull();
		table.dateTime("started_on").notNull();
		table.dateTime("ended_on").nullable();
		table.index("proxy_host_id");
	});
	logger.info(`[${migrateName}] uptime_event Table created`);

	const now = new Date().toISOString().replace("T", " ").split(".")[0];
	await knex("setting")
		.insert({
			id: "status-page",
			name: "Status Page",
			description: "Public status page configuration",
			value: "disabled",
			meta: JSON.stringify({ slug: "status", title: "Service Status", tag_id: null, host_ids: [] }),
		})
		.onConflict("id")
		.ignore();
	logger.info(`[${migrateName}] status-page setting row inserted`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.dropTableIfExists("uptime_event");
	await knex.schema.dropTableIfExists("upstream_status");
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("check_enabled");
		table.dropColumn("check_path");
		table.dropColumn("check_interval_s");
		table.dropColumn("expected_status");
	});
	await knex("setting").where("id", "status-page").delete();

	logger.info(`[${migrateName}] Tables dropped`);
};

export { up, down };
