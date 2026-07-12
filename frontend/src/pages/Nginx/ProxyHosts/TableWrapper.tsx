import { IconHelp, IconSearch, IconTags } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { useSearchParams } from "react-router-dom";
import { deleteProxyHost, setMaintenanceMode, type Tag, toggleProxyHost } from "src/api/backend";
import { Button, HasPermission, LoadingPage, TagFilter } from "src/components";
import { useProxyHosts } from "src/hooks";
import { T } from "src/locale";
import { showBulkTagModal, showDeleteConfirmModal, showHelpModal, showProxyHostMetricsModal, showProxyHostModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

const tagIdsFromParams = (params: URLSearchParams): number[] =>
	(params.get("tags") || "")
		.split(",")
		.map(Number)
		.filter((n) => Number.isInteger(n) && n > 0);

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [searchParams] = useSearchParams();
	const [search, setSearch] = useState("");
	const [tagFilter, setTagFilter] = useState<number[]>(() => tagIdsFromParams(searchParams));
	const [selectedIds, setSelectedIds] = useState<number[]>([]);
	const { isFetching, isLoading, isError, error, data } = useProxyHosts([
		"owner",
		"access_list",
		"certificate",
		"tags",
	]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteProxyHost(id);
		showObjectSuccess("proxy-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleProxyHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
		showObjectSuccess("proxy-host", enabled ? "enabled" : "disabled");
	};

	const handleMaintenanceToggle = async (id: number, enabled: boolean) => {
		await setMaintenanceMode(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
		showObjectSuccess("proxy-host", enabled ? "maintenance-enabled" : "maintenance-disabled");
	};

	const handleTagClick = (tag: Tag) => {
		if (tag.id) {
			setTagFilter((prev) => (prev.includes(tag.id || 0) ? prev : [...prev, tag.id || 0]));
		}
	};

	let filtered = null;
	if ((search || tagFilter.length) && data) {
		filtered = data?.filter((item) => {
			const matchesSearch =
				!search ||
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.forwardHost.toLowerCase().includes(search) ||
				`${item.forwardPort}`.includes(search);
			const matchesTags = !tagFilter.length || tagFilter.every((tid) => item.tags?.some((t) => t.id === tid));
			return matchesSearch && matchesTags;
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	const selectedHosts = data?.filter((h) => selectedIds.includes(h.id || 0)) || [];

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-lime" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="proxy-hosts" />
							</h2>
						</div>
						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list">
								{selectedHosts.length ? (
									<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
										<Button
											size="sm"
											className="btn-outline-primary"
											onClick={() => showBulkTagModal("proxy", selectedHosts)}
										>
											<IconTags size={16} className="me-1" />
											<T id="bulk.edit-tags" /> ({selectedHosts.length})
										</Button>
									</HasPermission>
								) : null}
								{data?.length ? (
									<div className="input-group input-group-flat w-auto">
										<span className="input-group-text input-group-text-sm">
											<IconSearch size={16} />
										</span>
										<input
											id="advanced-table-search"
											type="text"
											className="form-control form-control-sm"
											autoComplete="off"
											onChange={(e: any) => setSearch(e.target.value.toLowerCase().trim())}
										/>
									</div>
								) : null}
								{data?.length ? <TagFilter value={tagFilter} onChange={setTagFilter} /> : null}
								<Button size="sm" onClick={() => showHelpModal("ProxyHosts", "lime")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									{data?.length ? (
										<Button
											size="sm"
											className="btn-lime"
											onClick={() => showProxyHostModal("new")}
										>
											<T id="object.add" tData={{ object: "proxy-host" }} />
										</Button>
									) : null}
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!filtered}
					isFetching={isFetching}
					onEdit={(id: number) => showProxyHostModal(id)}
					onDelete={(id: number) => {
						const host = data?.find((h) => h.id === id);
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "proxy-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["proxy-hosts"], ["proxy-host", id]],
							children: (
								<>
									<T id="object.delete.content" tData={{ object: "proxy-host" }} />
									{host?.domainNames?.length ? (
										<div className="mt-2 fw-bold text-break">{host.domainNames.join(", ")}</div>
									) : null}
									{host?.forwardHost ? (
										<div className="mt-1 text-muted small">
											({host.forwardScheme}://{host.forwardHost}:{host.forwardPort})
										</div>
									) : null}
								</>
							),
						});
					}}
					onDisableToggle={handleDisableToggle}
					onNew={() => showProxyHostModal("new")}
					onTagClick={handleTagClick}
					onSelectionChange={setSelectedIds}
					onMetrics={(id: number) => showProxyHostMetricsModal(id)}
					onMaintenanceToggle={handleMaintenanceToggle}
				/>
			</div>
		</div>
	);
}
