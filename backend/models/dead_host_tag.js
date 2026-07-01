// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class DeadHostTag extends Model {
	static get name() {
		return "DeadHostTag";
	}

	static get tableName() {
		return "dead_host_tag";
	}
}

export default DeadHostTag;
