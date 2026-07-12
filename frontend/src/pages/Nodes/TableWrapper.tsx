import Alert from "react-bootstrap/Alert";
import { deleteNode } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useNodes } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";
import { showNodeModal, showNodeTokenModal } from "src/modals/NodeModal";
import { showObjectSuccess } from "src/notifications";
import SyncMatrix from "./SyncMatrix";
import Table from "./Table";

export default function TableWrapper() {
	const { isLoading, isError, error, data, isFetching } = useNodes();

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteNode(id);
		showObjectSuccess("node", "deleted");
	};
	return (
		<>
		<div className="card mt-4">
		<div className="card mt-4">
			<div className="card-status-top bg-azure" />
			<div className="card-header">
				<div className="row w-full">
					<div className="col">
						<h2 className="mt-1 mb-0">
							<T id="nodes" />
						</h2>
						<div className="text-secondary small">
							<T id="node.description" />
						</div>
					</div>

					<div className="col-md-auto col-sm-12">
						<div className="ms-auto d-flex flex-wrap btn-list">
							{data?.length ? (
								<Button size="sm" className="btn-azure" onClick={() => showNodeModal()}>
									<T id="object.add" tData={{ object: "node" }} />
								</Button>
							) : null}
						</div>
					</div>
				</div>
			</div>
			<Table
				data={data ?? []}
				isFetching={isFetching}
				onEdit={(id: number, name: string) => showNodeModal(id, name)}
				onRegenerateToken={(id: number, name: string) => showNodeTokenModal(id, name)}
				onDelete={(id: number) =>
					showDeleteConfirmModal({
						title: <T id="object.delete" tData={{ object: "node" }} />,
						onConfirm: () => handleDelete(id),
						invalidations: [["nodes"]],
						children: <T id="node.delete.content" />,
					})
				}
				onNew={() => showNodeModal()}
			/>
		</div>
		</div>
		<SyncMatrix />
		</>
	);
}
