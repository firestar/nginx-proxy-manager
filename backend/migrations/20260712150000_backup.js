import { migrate as logger } from "../logger.js";

const migrateName = "backup";

/**
 * Migrate Up
 *
 * Creates the backup_run history table and seeds the backup-schedule
 * setting row (value = enabled|disabled, meta holds cron/retention/s3).
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("backup_run", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.string("status", 10).notNull(); // ok|failed
		table.string("trigger", 10).notNull(); // manual|scheduled
		table.string("destination", 20).notNull().defaultTo("local"); // local|s3
		table.string("filename").nullable();
		table.string("s3_key").nullable();
		table.bigInteger("size").notNull().defaultTo(0);
		table.integer("encrypted").notNull().unsigned().defaultTo(0);
		table.text("error").nullable();
	});
	logger.info(`[${migrateName}] backup_run Table created`);

	await knex("setting")
		.insert({
			id: "backup-schedule",
			name: "Backup Schedule",
			description: "Scheduled backup + S3/MinIO upload configuration",
			value: "disabled",
			meta: JSON.stringify({
				cron: "0 3 * * *",
				retention_count: 7,
				encrypt: false,
				passphrase: "",
				s3: {
					endpoint: "",
					region: "us-east-1",
					bucket: "",
					access_key: "",
					secret_key: "",
					prefix: "npm-backups",
					force_path_style: true,
				},
			}),
		})
		.onConflict("id")
		.ignore();
	logger.info(`[${migrateName}] backup-schedule setting row inserted`);
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("backup_run");
	await knex("setting").where("id", "backup-schedule").delete();
	logger.info(`[${migrateName}] backup_run Table dropped`);
};

export { up, down };
