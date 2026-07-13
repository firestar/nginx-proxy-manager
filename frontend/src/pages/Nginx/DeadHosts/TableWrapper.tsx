import { IconHelp, IconSearch, IconTags } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { useSearchParams } from "react-router-dom";
import { deleteDeadHost, type Tag, toggleDeadHost } from "src/api/backend";
import { Button, HasPermission, LoadingPage, TagFilter } from "src/components";
import { useDeadHosts } from "src/hooks";
import { T } from "src/locale";
import { showBulkTagModal, showDeadHostModal, showDeleteConfirmModal, showHelpModal, showViewConfigModal } from "src/modals";
import { DEAD_HOSTS, MANAGE } from "src/modules/Permissions";
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
	const { isFetching, isLoading, isError, error, data } = useDeadHosts(["owner", "certificate", "tags"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteDeadHost(id);
		showObjectSuccess("dead-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleDeadHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["dead-host", id] });
		showObjectSuccess("dead-host", enabled ? "enabled" : "disabled");
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
				!search || item.domainNames.some((domain: string) => domain.toLowerCase().includes(search));
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
			<div className="card-status-top bg-red" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="dead-hosts" />
							</h2>
						</div>

						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list">
								{selectedHosts.length ? (
									<HasPermission section={DEAD_HOSTS} permission={MANAGE} hideError>
										<Button
											size="sm"
											className="btn-outline-primary"
											onClick={() => showBulkTagModal("dead", selectedHosts)}
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
								<Button size="sm" onClick={() => showHelpModal("DeadHosts", "red")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={DEAD_HOSTS} permission={MANAGE} hideError>
									{data?.length ? (
										<Button size="sm" className="btn-red" onClick={() => showDeadHostModal("new")}>
											<T id="object.add" tData={{ object: "dead-host" }} />
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
					onEdit={(id: number) => showDeadHostModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "dead-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["dead-hosts"], ["dead-host", id]],
							children: <T id="object.delete.content" tData={{ object: "dead-host" }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onNew={() => showDeadHostModal("new")}
					onTagClick={handleTagClick}
					onSelectionChange={setSelectedIds}
					onViewConfig={(id: number) => showViewConfigModal("dead_host", id)}
				/>
			</div>
		</div>
	);
}
