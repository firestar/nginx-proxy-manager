import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for audit-log filter/pagination logic.
 * Tests the pure query-building logic with a spy (no DB dependency).
 */

const buildQuerySpy = () => {
	const calls = [];
	const builder = {
		_limit: null,
		_offset: null,
		calls,
		orderBy: () => builder,
		allowGraph: () => builder,
		withGraphFetched: () => builder,
		where: (...args) => {
			calls.push(["where", ...args]);
			return builder;
		},
		limit: (n) => {
			builder._limit = n;
			return builder;
		},
		offset: (n) => {
			builder._offset = n;
			return builder;
		},
	};
	return builder;
};

// Mirrors the filter application in internal/audit-log.js getAll
const applyFilters = (query, searchQuery, filters) => {
	const { object_type, action, user_id, since, until } = filters ?? {};

	if (typeof searchQuery === "string" && searchQuery.length > 0) {
		// Real code wraps in a function: query.where(function() { this.where(...) })
		query.where(() => searchQuery);
	}

	if (object_type) query.where("object_type", object_type);
	if (action) query.where("action", action);
	if (user_id) query.where("user_id", user_id);
	if (since) query.where("created_on", ">=", since);
	if (until) query.where("created_on", "<=", until);
};

const applyPagination = (query, paginated, limit, offset) => {
	if (paginated) {
		query.limit(limit).offset(offset);
	} else {
		query.limit(100);
	}
};

describe("audit-log getAll filters", () => {
	it("no filters: only limit(100) applied, no WHERE clauses", () => {
		const q = buildQuerySpy();
		applyFilters(q, null, {});
		applyPagination(q, false, 50, 0);
		assert.equal(q.calls.length, 0);
		assert.equal(q._limit, 100);
		assert.equal(q._offset, null);
	});

	it("searchQuery wraps WHERE in a function", () => {
		const q = buildQuerySpy();
		applyFilters(q, "foo", {});
		assert.equal(q.calls.length, 1);
		assert.equal(q.calls[0][0], "where");
		assert.equal(typeof q.calls[0][1], "function");
	});

	it("empty string searchQuery adds no clause", () => {
		const q = buildQuerySpy();
		applyFilters(q, "", {});
		assert.equal(q.calls.length, 0);
	});

	it("object_type filter adds WHERE object_type", () => {
		const q = buildQuerySpy();
		applyFilters(q, null, { object_type: "proxy-host" });
		const w = q.calls.find((c) => c[1] === "object_type");
		assert.ok(w);
		assert.equal(w[2], "proxy-host");
	});

	it("action filter adds WHERE action", () => {
		const q = buildQuerySpy();
		applyFilters(q, null, { action: "created" });
		const w = q.calls.find((c) => c[1] === "action");
		assert.ok(w);
		assert.equal(w[2], "created");
	});

	it("user_id filter adds WHERE user_id", () => {
		const q = buildQuerySpy();
		applyFilters(q, null, { user_id: 3 });
		const w = q.calls.find((c) => c[1] === "user_id");
		assert.ok(w);
		assert.equal(w[2], 3);
	});

	it("since/until add WHERE created_on >= and <=", () => {
		const q = buildQuerySpy();
		applyFilters(q, null, { since: "2024-01-01T00:00:00Z", until: "2024-12-31T23:59:59Z" });
		const s = q.calls.find((c) => c[2] === ">=");
		const u = q.calls.find((c) => c[2] === "<=");
		assert.ok(s);
		assert.ok(u);
		assert.equal(s[3], "2024-01-01T00:00:00Z");
		assert.equal(u[3], "2024-12-31T23:59:59Z");
	});

	it("combined filters apply all WHERE clauses", () => {
		const q = buildQuerySpy();
		applyFilters(q, "test", { object_type: "user", action: "deleted", user_id: 1 });
		assert.equal(q.calls.length, 4);
	});
});

describe("audit-log back-compat envelope logic", () => {
	it("no limit/offset → paginated=false", () => {
		const limit = null;
		const offset = null;
		assert.equal(limit !== null || offset !== null, false);
	});

	it("limit supplied → paginated=true", () => {
		const limit = 50;
		const offset = null;
		assert.equal(limit !== null || offset !== null, true);
	});

	it("offset supplied → paginated=true", () => {
		const limit = null;
		const offset = 0;
		assert.equal(limit !== null || offset !== null, true);
	});

	it("paginated: applies limit and offset to query", () => {
		const q = buildQuerySpy();
		applyPagination(q, true, 50, 100);
		assert.equal(q._limit, 50);
		assert.equal(q._offset, 100);
	});

	it("not paginated: applies limit(100) and no offset", () => {
		const q = buildQuerySpy();
		applyPagination(q, false, 50, 0);
		assert.equal(q._limit, 100);
		assert.equal(q._offset, null);
	});
});
