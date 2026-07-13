import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { LoadingPage } from "src/components";
import { type AuditLogFilters } from "src/api/backend";
import { useAuditLogsPaged, useUsers } from "src/hooks";
import { intl, T } from "src/locale";
import { showEventDetailsModal } from "src/modals";
import Table from "./Table";

const PAGE_SIZE = 50;

const OBJECT_TYPES = [
	"access-list",
	"certificate",
	"dead-host",
	"proxy-host",
	"redirection-host",
	"stream",
	"user",
];

const ACTIONS = ["created", "updated", "deleted", "enabled", "disabled", "renewed"];

export default function TableWrapper() {
	const [pageIndex, setPageIndex] = useState(0);
	const [filters, setFilters] = useState<AuditLogFilters>({});
	const [draftQuery, setDraftQuery] = useState("");

	const { data: users } = useUsers();
	const { isFetching, isLoading, isError, error, data } = useAuditLogsPaged(
		["user"],
		PAGE_SIZE,
		pageIndex * PAGE_SIZE,
		filters,
	);

	const rows = data?.rows ?? [];
	const total = data?.total ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const resetPage = useCallback(() => setPageIndex(0), []);

	const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			setFilters((f) => ({ ...f, query: draftQuery || undefined }));
			resetPage();
		}
	};

	const handleQueryBlur = () => {
		setFilters((f) => ({ ...f, query: draftQuery || undefined }));
		resetPage();
	};

	const handleObjectType = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setFilters((f) => ({ ...f, object_type: e.target.value || undefined }));
		resetPage();
	};

	const handleAction = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setFilters((f) => ({ ...f, action: e.target.value || undefined }));
		resetPage();
	};

	const handleUser = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const val = parseInt(e.target.value, 10);
		setFilters((f) => ({ ...f, user_id: val > 0 ? val : undefined }));
		resetPage();
	};

	const handleSince = (e: React.ChangeEvent<HTMLInputElement>) => {
		setFilters((f) => ({ ...f, since: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined }));
		resetPage();
	};

	const handleUntil = (e: React.ChangeEvent<HTMLInputElement>) => {
		setFilters((f) => ({ ...f, until: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined }));
		resetPage();
	};

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-purple" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full g-2 align-items-end">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="auditlogs" />
							</h2>
						</div>
					</div>
					{/* Filter toolbar */}
					<div className="row mt-3 g-2 align-items-end">
						<div className="col-12 col-sm-auto flex-grow-1">
							<input
								type="text"
								className="form-control"
								placeholder={intl.formatMessage({ id: "audit-log.filter.query" })}
								value={draftQuery}
								onChange={(e) => setDraftQuery(e.target.value)}
								onKeyDown={handleQueryKeyDown}
								onBlur={handleQueryBlur}
							/>
						</div>
						<div className="col-6 col-sm-auto">
							<select className="form-select" onChange={handleObjectType} defaultValue="">
								<option value="">{intl.formatMessage({ id: "audit-log.object-type.all" })}</option>
								{OBJECT_TYPES.map((t) => (
									<option key={t} value={t}>{t}</option>
								))}
							</select>
						</div>
						<div className="col-6 col-sm-auto">
							<select className="form-select" onChange={handleAction} defaultValue="">
								<option value="">{intl.formatMessage({ id: "audit-log.action.all" })}</option>
								{ACTIONS.map((a) => (
									<option key={a} value={a}>{a}</option>
								))}
							</select>
						</div>
						{users && users.length > 0 && (
							<div className="col-6 col-sm-auto">
								<select className="form-select" onChange={handleUser} defaultValue="">
									<option value="">{intl.formatMessage({ id: "audit-log.user.all" })}</option>
									{users.map((u) => (
										<option key={u.id} value={u.id}>{u.name}</option>
									))}
								</select>
							</div>
						)}
						<div className="col-6 col-sm-auto">
							<input
								type="date"
								className="form-control"
								title={intl.formatMessage({ id: "audit-log.filter.since" })}
								onChange={handleSince}
							/>
						</div>
						<div className="col-6 col-sm-auto">
							<input
								type="date"
								className="form-control"
								title={intl.formatMessage({ id: "audit-log.filter.until" })}
								onChange={handleUntil}
							/>
						</div>
					</div>
				</div>
				<Table data={rows} isFetching={isFetching} onSelectItem={showEventDetailsModal} />
				{/* Pagination controls */}
				<div className="card-footer d-flex align-items-center justify-content-between">
					<div className="text-secondary">
						{intl.formatMessage({ id: "pagination.page" }, { page: pageIndex + 1 })}{" "}
						{intl.formatMessage({ id: "pagination.of" }, { total: pageCount })}
					</div>
					<div className="d-flex gap-2">
						<button
							type="button"
							className="btn btn-sm btn-outline-secondary"
							disabled={pageIndex === 0 || isFetching}
							onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
						>
							<IconChevronLeft size={14} />
							<span className="ms-1"><T id="pagination.prev" /></span>
						</button>
						<button
							type="button"
							className="btn btn-sm btn-outline-secondary"
							disabled={pageIndex >= pageCount - 1 || isFetching}
							onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
						>
							<span className="me-1"><T id="pagination.next" /></span>
							<IconChevronRight size={14} />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
