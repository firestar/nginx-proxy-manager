// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class UserTag extends Model {
	$beforeInsert() {
		this.created_on = now();
	}

	static get name() {
		return "UserTag";
	}

	static get tableName() {
		return "user_tag";
	}
}

export default UserTag;
