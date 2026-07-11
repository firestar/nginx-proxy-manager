import Alert from "react-bootstrap/Alert";
import { deleteApiKey } from "src/api/backend";
import { Button, LoadingPage } from "src/components";
import { useApiKeys } from "src/hooks";
import { T } from "src/locale";
import { showApiKeyModal, showApiKeyRerollModal, showDeleteConfirmModal } from "src/modals";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const { isLoading, isError, error, data, isFetching } = useApiKeys();

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleRevoke = async (id: number) => {
		await deleteApiKey(id);
		showObjectSuccess("api-key", "deleted");
	};

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-cyan" />
			<div className="card-header">
				<div className="row w-full">
					<div className="col">
						<h2 className="mt-1 mb-0">
							<T id="api-keys" />
						</h2>
						<div className="text-secondary small">
							<T id="apikey.description" />
						</div>
					</div>

					<div className="col-md-auto col-sm-12">
						<div className="ms-auto d-flex flex-wrap btn-list">
							{data?.length ? (
								<Button size="sm" className="btn-cyan" onClick={() => showApiKeyModal()}>
									<T id="object.add" tData={{ object: "api-key" }} />
								</Button>
							) : null}
						</div>
					</div>
				</div>
			</div>
			<Table
				data={data ?? []}
				isFetching={isFetching}
				onReroll={(id: number, name: string) => showApiKeyRerollModal(id, name)}
				onRevoke={(id: number) =>
					showDeleteConfirmModal({
						title: <T id="apikey.revoke" />,
						onConfirm: () => handleRevoke(id),
						invalidations: [["api-keys"]],
						children: <T id="apikey.revoke.content" />,
					})
				}
				onNew={() => showApiKeyModal()}
			/>
		</div>
	);
}
