import { useQuery } from "@tanstack/react-query";
import { type AuditLog, type AuditLogExpansion, type AuditLogFilters, type AuditLogPage, getAuditLogs, getAuditLogsPaged } from "src/api/backend";

const fetchAuditLogs = (expand?: AuditLogExpansion[]) => {
	return getAuditLogs(expand);
};

const useAuditLogs = (expand?: AuditLogExpansion[], options = {}) => {
	return useQuery<AuditLog[], Error>({
		queryKey: ["audit-logs", { expand }],
		queryFn: () => fetchAuditLogs(expand),
		staleTime: 10 * 1000,
		...options,
	});
};

const useAuditLogsPaged = (
	expand: AuditLogExpansion[],
	limit: number,
	offset: number,
	filters: AuditLogFilters = {},
	options = {},
) => {
	return useQuery<AuditLogPage, Error>({
		queryKey: ["audit-logs-paged", { expand, limit, offset, filters }],
		queryFn: () => getAuditLogsPaged(expand, limit, offset, filters),
		staleTime: 10 * 1000,
		placeholderData: (prev) => prev,
		...options,
	});
};

export { fetchAuditLogs, useAuditLogs, useAuditLogsPaged };
