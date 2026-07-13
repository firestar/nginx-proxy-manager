import CodeEditor from "@uiw/react-textarea-code-editor";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useEffect, useState } from "react";
import { Alert, Button, Modal, Spinner } from "react-bootstrap";
import { getDeadHostConfig, getProxyHostConfig, getRedirectionHostConfig, getStreamConfig } from "src/api/backend";
import { T } from "src/locale";

type HostType = "proxy_host" | "redirection_host" | "dead_host" | "stream";

function fetchConfig(hostType: HostType, hostId: number): Promise<{ config: string }> {
	switch (hostType) {
		case "proxy_host":
			return getProxyHostConfig(hostId);
		case "redirection_host":
			return getRedirectionHostConfig(hostId);
		case "dead_host":
			return getDeadHostConfig(hostId);
		case "stream":
			return getStreamConfig(hostId);
	}
}

const showViewConfigModal = (type: HostType, id: number) => {
	EasyModal.show(ViewConfigModal, { hostType: type, hostId: id });
};

interface Props extends InnerModalProps {
	hostType: HostType;
	hostId: number;
}

const ViewConfigModal = EasyModal.create(({ hostType, hostId, visible, remove }: Props) => {
	const [config, setConfig] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		setLoading(true);
		setError(null);
		fetchConfig(hostType, hostId)
			.then((r) => setConfig(r.config))
			.catch((e: any) => setError(e?.message || "Unknown error"))
			.finally(() => setLoading(false));
	}, [hostType, hostId]);

	const handleCopy = () => {
		if (config) {
			navigator.clipboard.writeText(config).then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			});
		}
	};

	return (
		<Modal show={visible} onHide={remove} size="lg">
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="config-preview.title" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				{loading && (
					<div className="text-center py-4">
						<Spinner animation="border" size="sm" />
					</div>
				)}
				{error && <Alert variant="danger">{error}</Alert>}
				{!loading && !error && config !== null && (
					<>
						<div className="d-flex justify-content-end mb-2">
							<Button variant="outline-secondary" size="sm" onClick={handleCopy}>
								{copied ? "✓" : <T id="action.copy" />}
							</Button>
						</div>
						<CodeEditor
							language="nginx"
							value={config}
							readOnly
							padding={15}
							data-color-mode="dark"
							style={{
								fontFamily: "ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
								borderRadius: "0.3rem",
								backgroundColor: "var(--tblr-bg-surface-dark)",
							}}
						/>
					</>
				)}
			</Modal.Body>
		</Modal>
	);
});

export { showViewConfigModal };
