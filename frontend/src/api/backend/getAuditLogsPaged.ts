import * as api from "./base";
import type { AuditLogExpansion } from "./expansions";
import type { AuditLog } from "./models";

export interface AuditLogFilters {
	query?: string;
	object_type?: string;
	action?: string;
	user_id?: number;
	since?: string;
	until?: string;
}

export interface AuditLogPage {
	total: number;
	rows: AuditLog[];
}

export async function getAuditLogsPaged(
	expand: AuditLogExpansion[],
	limit: number,
	offset: number,
	filters: AuditLogFilters = {},
): Promise<AuditLogPage> {
	return await api.get({
		url: "/audit-log",
		params: {
			expand: expand.join(","),
			limit,
			offset,
			...filters,
		},
	});
}
