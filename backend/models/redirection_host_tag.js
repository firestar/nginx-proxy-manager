// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class RedirectionHostTag extends Model {
	static get name() {
		return "RedirectionHostTag";
	}

	static get tableName() {
		return "redirection_host_tag";
	}
}

export default RedirectionHostTag;
