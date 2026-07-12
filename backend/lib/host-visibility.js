import db from "../db.js";
import userTagModel from "../models/user_tag.js";
import errs from "./error.js";

// Pivot table + FK column for each taggable host type.
const PIVOTS = {
	proxy_host: { table: "proxy_host_tag", col: "proxy_host_id" },
	redirection_host: { table: "redirection_host_tag", col: "redirection_host_id" },
	dead_host: { table: "dead_host_tag", col: "dead_host_id" },
	stream: { table: "stream_tag", col: "stream_id" },
};

/**
 * Fetch the tag IDs assigned to a user.
 *
 * @param   {Number}  userId
 * @returns {Promise<number[]>}
 */
const getUserTagIds = async (userId) => {
	const rows = await userTagModel.query().select("tag_id").where("user_id", userId);
	return rows.map((r) => r.tag_id);
};

/**
 * Apply row-level visibility filter to a host query.
 *
 * - "all"  → noop
 * - "user" → andWhere owner_user_id = userId
 * - "tags" → whereExists on the host's tag pivot, intersecting tagIds.
 *            An empty tagIds set is replaced with [0] so zero-tag hosts
 *            and tag-less users both return nothing.
 *
 * @param   {Object}   query       Objection query builder
 * @param   {String}   objectType  proxy_host | redirection_host | dead_host | stream
 * @param   {Object}   opts
 * @param   {String}   opts.visibility
 * @param   {Number}   opts.userId
 * @param   {number[]} opts.tagIds  only needed when visibility === "tags"
 */
const applyHostVisibility = (query, objectType, { visibility, userId, tagIds = [] }) => {
	if (visibility === "user") {
		query.andWhere(`${objectType}.owner_user_id`, userId);
		return;
	}
	if (visibility === "tags") {
		const pivot = PIVOTS[objectType];
		if (!pivot) {
			throw new errs.InternalValidationError(`Unknown host type for visibility: ${objectType}`);
		}
		const ids = tagIds.length ? tagIds : [0];
		const knex = db();
		query.whereExists(
			knex
				.select(knex.raw("1"))
				.from(pivot.table)
				.where(`${pivot.table}.${pivot.col}`, knex.ref(`${objectType}.id`))
				.whereIn(`${pivot.table}.tag_id`, ids),
		);
	}
};

/**
 * Validate that a tag-scoped write (create or update) includes at least one of
 * the user's own tags. Throws ValidationError when the constraint is violated.
 *
 * Only enforced when visibility === "tags".
 *
 * @param {Object}   opts
 * @param {String}   opts.visibility
 * @param {number[]} opts.tagIds       the tag_ids submitted for the host
 * @param {number[]} opts.userTagIds   the tag_ids assigned to the acting user
 */
const assertTagWrite = ({ visibility, tagIds = [], userTagIds = [] }) => {
	if (visibility !== "tags") return;
	const ownTagSet = new Set(userTagIds);
	const hasOwn = tagIds.some((id) => ownTagSet.has(id));
	if (!hasOwn) {
		throw new errs.ValidationError(
			"Tag-scoped users must include at least one of their own tags on every host they manage.",
		);
	}
};

export { applyHostVisibility, assertTagWrite, getUserTagIds };
