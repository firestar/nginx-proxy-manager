// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class ProxyHostTag extends Model {
	static get name() {
		return "ProxyHostTag";
	}

	static get tableName() {
		return "proxy_host_tag";
	}
}

export default ProxyHostTag;
