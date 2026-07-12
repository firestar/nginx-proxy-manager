import { migrate as logger } from "../logger.js";

const migrateName = "notifications";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("notification_channel", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("is_deleted").notNull().unsigned().defaultTo(0);
		table.string("name").notNull();
		table.string("type", 20).notNull(); // webhook|slack|discord|telegram|ntfy|email
		table.text("config").notNull().defaultTo("{}"); // JSON
		table.text("events").notNull().defaultTo("[]"); // JSON array of event names
		table.integer("enabled").notNull().unsigned().defaultTo(1);
	});
	logger.info(`[${migrateName}] notification_channel Table created`);

	await knex.schema.createTable("notification_log", (table) => {
		table.increments().primary();
		table.integer("channel_id").notNull().unsigned();
		table.string("event").notNull();
		table.string("status", 10).notNull(); // sent|failed
		table.text("detail").nullable();
		table.dateTime("created_on").notNull();
	});
	logger.info(`[${migrateName}] notification_log Table created`);

	// Insert SMTP setting row (value = enabled|disabled, meta holds connection details)
	const now = new Date().toISOString().replace("T", " ").split(".")[0];
	await knex("setting").insert({
		id: "smtp",
		name: "SMTP",
		description: "SMTP email server configuration for notifications",
		value: "disabled",
		meta: JSON.stringify({ host: "", port: 587, secure: false, user: "", pass: "", from: "" }),
	}).onConflict("id").ignore();
	logger.info(`[${migrateName}] smtp setting row inserted`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("notification_log");
	await knex.schema.dropTableIfExists("notification_channel");
	await knex("setting").where("id", "smtp").delete();
	logger.info(`[${migrateName}] Tables dropped`);
};

export { up, down };
