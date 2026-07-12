import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class BackupRun extends Model {
	$beforeInsert() {
		if (typeof this.created_on === "undefined") {
			this.created_on = now();
		}
	}

	static get name() {
		return "BackupRun";
	}

	static get tableName() {
		return "backup_run";
	}
}

export default BackupRun;
