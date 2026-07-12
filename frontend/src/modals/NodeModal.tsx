import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { type NPMNode, createNode, regenerateNodeToken, updateNode } from "src/api/backend";
import { Button } from "src/components";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showNodeModal = (id?: number, name?: string) => {
	EasyModal.show(NodeModal, { nodeId: id, name });
};

const showNodeTokenModal = (id: number, name: string) => {
	EasyModal.show(NodeTokenModal, { nodeId: id, name });
};

const CopyRow = ({ value, mono = true }: { value: string; mono?: boolean }) => {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// Clipboard API needs a secure context; best-effort for http admin UIs.
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="input-group mb-2">
			<input
				type="text"
				readOnly
				className={`form-control ${mono ? "font-monospace" : ""}`}
				value={value}
				onFocus={(e) => e.target.select()}
			/>
			<Button className="btn-icon" onClick={copy} aria-label="Copy">
				{copied ? <IconCheck size={18} className="text-success" /> : <IconCopy size={18} />}
			</Button>
		</div>
	);
};

/**
 * One-time display of the enrollment token and ready-made docker run command.
 * Once the modal closes the token can never be shown again.
 */
const TokenBody = ({ node, onClose }: { node: NPMNode; onClose: () => void }) => (
	<>
		<Modal.Header closeButton>
			<Modal.Title>{node.name}</Modal.Title>
		</Modal.Header>
		<Modal.Body>
			<Alert variant="warning">
				<T id="node.token-warning" />
			</Alert>
			<div className="form-label">
				<T id="node.enroll-token" />
			</div>
			<CopyRow value={node.token || ""} />
			<div className="form-label mt-2">
				<T id="node.setup-command" />
			</div>
			<CopyRow value={node.setupCommand || ""} />
			<div className="form-hint">
				<T id="node.setup-command.hint" />
			</div>
		</Modal.Body>
		<Modal.Footer>
			<Button className="ms-auto" onClick={onClose}>
				<T id="action.close" />
			</Button>
		</Modal.Footer>
	</>
);

interface Props extends InnerModalProps {
	nodeId?: number;
	name?: string;
}
const NodeModal = EasyModal.create(({ nodeId, name, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [created, setCreated] = useState<NPMNode | null>(null);
	const isNew = typeof nodeId === "undefined";

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			if (isNew) {
				const result = await createNode({ name: values.name });
				setCreated(result);
			} else {
				await updateNode(nodeId, { name: values.name });
				remove();
			}
			queryClient.invalidateQueries({ queryKey: ["nodes"] });
			showObjectSuccess("node", "saved");
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={remove} backdrop={created ? "static" : true}>
			{created ? (
				<TokenBody node={created} onClose={remove} />
			) : (
				<Formik initialValues={{ name: name || "" }} onSubmit={onSubmit}>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={isNew ? "object.add" : "object.edit"} tData={{ object: "node" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								{isNew ? (
									<div className="form-hint mb-3">
										<T id="node.add.hint" />
									</div>
								) : null}
								<Field name="name" validate={validateString(1, 100)}>
									{({ field, form }: any) => (
										<div className="mb-3">
											<label htmlFor="name" className="form-label">
												<T id="column.name" />
											</label>
											<input
												id="name"
												type="text"
												required
												autoComplete="off"
												placeholder="edge-node-1"
												className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
												{...field}
											/>
											{form.errors.name ? (
												<div className="invalid-feedback">
													{form.errors.name && form.touched.name ? form.errors.name : null}
												</div>
											) : null}
										</div>
									)}
								</Field>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto btn-azure"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

interface TokenProps extends InnerModalProps {
	nodeId: number;
	name: string;
}
const NodeTokenModal = EasyModal.create(({ nodeId, name, visible, remove }: TokenProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [regenerated, setRegenerated] = useState<NPMNode | null>(null);

	const onConfirm = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			const result = await regenerateNodeToken(nodeId);
			queryClient.invalidateQueries({ queryKey: ["nodes"] });
			showObjectSuccess("node", "saved");
			setRegenerated(result);
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={remove} backdrop={regenerated ? "static" : true}>
			{regenerated ? (
				<TokenBody node={regenerated} onClose={remove} />
			) : (
				<>
					<Modal.Header closeButton>
						<Modal.Title>
							<T id="node.regenerate-token" /> — {name}
						</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
							{errorMsg}
						</Alert>
						<T id="node.regenerate-token.content" />
					</Modal.Body>
					<Modal.Footer>
						<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
							<T id="cancel" />
						</Button>
						<Button
							actionType="primary"
							className="ms-auto btn-warning"
							isLoading={isSubmitting}
							disabled={isSubmitting}
							onClick={onConfirm}
						>
							<T id="node.regenerate-token" />
						</Button>
					</Modal.Footer>
				</>
			)}
		</Modal>
	);
});

export { showNodeModal, showNodeTokenModal };
