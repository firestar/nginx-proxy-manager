// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class NodeApplyLog extends Model {
	static get name() {
		return "NodeApplyLog";
	}

	static get tableName() {
		return "node_apply_log";
	}
}

export default NodeApplyLog;
