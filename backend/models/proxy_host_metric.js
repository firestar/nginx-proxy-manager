// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class ProxyHostMetric extends Model {
	static get name() {
		return "ProxyHostMetric";
	}

	static get tableName() {
		return "proxy_host_metric";
	}
}

export default ProxyHostMetric;
