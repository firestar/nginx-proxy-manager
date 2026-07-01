// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class StreamTag extends Model {
	static get name() {
		return "StreamTag";
	}

	static get tableName() {
		return "stream_tag";
	}
}

export default StreamTag;
