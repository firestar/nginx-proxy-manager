import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteTag, type Tag } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useDeadHosts, useProxyHosts, useRedirectionHosts, useStreams, useTags } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showTagModal } from "src/modals";
import { showObjectSuccess } from "src/notifications";
import Gallery, { type TagUsage } from "./Gallery";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isLoading, isError, error, data } = useTags(["owner"]);

	// Usage counts are computed client-side from the host lists.
	const { data: proxyHosts } = useProxyHosts(["tags"]);
	const { data: redirectionHosts } = useRedirectionHosts(["tags"]);
	const { data: deadHosts } = useDeadHosts(["tags"]);
	const { data: streams } = useStreams(["tags"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const usage: Record<number, TagUsage> = {};
	const countUp = (tags: Tag[] | undefined, key: keyof TagUsage) => {
		tags?.forEach((tag) => {
			if (!tag.id) return;
			usage[tag.id] = usage[tag.id] || { proxy: 0, redirection: 0, dead: 0, stream: 0 };
			usage[tag.id][key]++;
		});
	};
	proxyHosts?.forEach((h) => {
		countUp(h.tags, "proxy");
	});
	redirectionHosts?.forEach((h) => {
		countUp(h.tags, "redirection");
	});
	deadHosts?.forEach((h) => {
		countUp(h.tags, "dead");
	});
	streams?.forEach((h) => {
		countUp(h.tags, "stream");
	});

	const handleDelete = async (id: number) => {
		await deleteTag(id);
		showObjectSuccess("tag", "deleted");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.name.toLowerCase().includes(search);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-purple" />
			<div className="card-header">
				<div className="row w-full">
					<div className="col">
						<h2 className="mt-1 mb-0">
							<T id="tags" />
						</h2>
					</div>

					<div className="col-md-auto col-sm-12">
						<div className="ms-auto d-flex flex-wrap btn-list">
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
							{data?.length ? (
								<Button size="sm" className="btn-purple" onClick={() => showTagModal("new")}>
									<T id="object.add" tData={{ object: "tag" }} />
								</Button>
							) : null}
						</div>
					</div>
				</div>
			</div>
			<Gallery
				data={filtered ?? data ?? []}
				usage={usage}
				isFiltered={!!filtered}
				onEdit={(id: number) => showTagModal(id)}
				onDelete={(id: number) =>
					showDeleteConfirmModal({
						title: <T id="object.delete" tData={{ object: "tag" }} />,
						onConfirm: () => handleDelete(id),
						invalidations: [["tags"], ["tag", id]],
						children: <T id="object.delete.content" tData={{ object: "tag" }} />,
					})
				}
				onNew={() => showTagModal("new")}
			/>
		</div>
	);
}
