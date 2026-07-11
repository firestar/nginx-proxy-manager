import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { type ApiKey, createApiKey, rerollApiKey } from "src/api/backend";
import { Button } from "src/components";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showApiKeyModal = () => {
	EasyModal.show(ApiKeyModal, {});
};

const showApiKeyRerollModal = (keyId: number, name: string) => {
	EasyModal.show(ApiKeyRerollModal, { keyId, name });
};

/**
 * One-time display of a freshly created/rerolled secret. Once the modal
 * closes the key can never be shown again.
 */
const SecretBody = ({ apiKey, onClose }: { apiKey: ApiKey; onClose: () => void }) => {
	const [copied, setCopied] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const copy = async () => {
		if (!apiKey.key) return;
		try {
			await navigator.clipboard.writeText(apiKey.key);
		} catch {
			// Clipboard API needs a secure context; fall back for plain-http admin UIs.
			inputRef.current?.select();
			document.execCommand("copy");
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<>
			<Modal.Header closeButton>
				<Modal.Title>{apiKey.name}</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="warning">
					<T id="apikey.secret-warning" />
				</Alert>
				<div className="input-group">
					<input
						ref={inputRef}
						type="text"
						readOnly
						className="form-control font-monospace"
						value={apiKey.key || ""}
						onFocus={(e) => e.target.select()}
					/>
					<Button className="btn-icon" onClick={copy} aria-label="Copy">
						{copied ? <IconCheck size={18} className="text-success" /> : <IconCopy size={18} />}
					</Button>
				</div>
			</Modal.Body>
			<Modal.Footer>
				<Button className="ms-auto" onClick={onClose}>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</>
	);
};

const ApiKeyModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [created, setCreated] = useState<ApiKey | null>(null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			const result = await createApiKey({ name: values.name });
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
			showObjectSuccess("api-key", "saved");
			setCreated(result);
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={remove} backdrop={created ? "static" : true}>
			{created ? (
				<SecretBody apiKey={created} onClose={remove} />
			) : (
				<Formik initialValues={{ name: "" }} onSubmit={onSubmit}>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id="object.add" tData={{ object: "api-key" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
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
												placeholder="MCP Server"
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
									className="ms-auto btn-cyan"
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

interface RerollProps extends InnerModalProps {
	keyId: number;
	name: string;
}
const ApiKeyRerollModal = EasyModal.create(({ keyId, name, visible, remove }: RerollProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [rerolled, setRerolled] = useState<ApiKey | null>(null);

	const onConfirm = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			const result = await rerollApiKey(keyId);
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
			showObjectSuccess("api-key", "saved");
			setRerolled(result);
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={remove} backdrop={rerolled ? "static" : true}>
			{rerolled ? (
				<SecretBody apiKey={rerolled} onClose={remove} />
			) : (
				<>
					<Modal.Header closeButton>
						<Modal.Title>
							<T id="apikey.reroll" /> — {name}
						</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
							{errorMsg}
						</Alert>
						<T id="apikey.reroll.content" />
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
							<T id="apikey.reroll" />
						</Button>
					</Modal.Footer>
				</>
			)}
		</Modal>
	);
});

export { showApiKeyModal, showApiKeyRerollModal };
