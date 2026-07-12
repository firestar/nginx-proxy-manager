import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class NotificationLog extends Model {
	$beforeInsert() {
		this.created_on = now();
	}

	static get name() {
		return "NotificationLog";
	}

	static get tableName() {
		return "notification_log";
	}
}

export default NotificationLog;
