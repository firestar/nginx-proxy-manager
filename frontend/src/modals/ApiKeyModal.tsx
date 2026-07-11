import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useRef, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { type ApiKey, createApiKey, rerollApiKey } from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";
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

// Scope model: per resource an access level; "hidden" means the key cannot
// touch that resource at all. Mirrors the enum accepted by POST /api-keys.
const SCOPE_RESOURCES = [
	{ key: "proxy_hosts", labelId: "proxy-hosts" },
	{ key: "redirection_hosts", labelId: "redirection-hosts" },
	{ key: "dead_hosts", labelId: "dead-hosts" },
	{ key: "streams", labelId: "streams" },
	{ key: "access_lists", labelId: "access-lists" },
	{ key: "certificates", labelId: "certificates" },
];
const SCOPE_LEVELS = ["hidden", "view", "manage"];

const ApiKeyModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [created, setCreated] = useState<ApiKey | null>(null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		const scopes = values.fullAccess
			? undefined
			: SCOPE_RESOURCES.filter((r) => values.scopes[r.key] !== "hidden").map(
					(r) => `${r.key}:${values.scopes[r.key]}`,
				);
		// An empty scopes array would create an unrestricted key; force a choice.
		if (scopes && !scopes.length) {
			setErrorMsg(<T id="apikey.scopes-required" />);
			setSubmitting(false);
			return;
		}
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			const result = await createApiKey({ name: values.name, scopes });
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
				<Formik
					initialValues={{
						name: "",
						fullAccess: true,
						scopes: Object.fromEntries(SCOPE_RESOURCES.map((r) => [r.key, "hidden"])),
					}}
					onSubmit={onSubmit}
				>
					{({ values }) => (
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
								<div className="mb-3">
									<label className="form-check form-switch mb-0">
										<Field type="checkbox" name="fullAccess" className="form-check-input" />
										<span className="form-check-label">
											<T id="apikey.full-access" />
										</span>
									</label>
									<div className="form-hint">
										<T id="apikey.full-access.hint" />
									</div>
								</div>
								{!values.fullAccess ? (
									<div className="mb-3">
										<label className="form-label mb-1">
											<T id="apikey.scopes" />
										</label>
										<div className="form-hint mb-2">
											<T id="apikey.scopes.hint" />
										</div>
										{SCOPE_RESOURCES.map((resource) => (
											<div className="row g-2 align-items-center mb-1" key={resource.key}>
												<div className="col-6">
													<label className="form-label mb-0" htmlFor={`scope-${resource.key}`}>
														<T id={resource.labelId} />
													</label>
												</div>
												<div className="col-6">
													<Field
														as="select"
														id={`scope-${resource.key}`}
														name={`scopes.${resource.key}`}
														className="form-select form-select-sm"
													>
														{SCOPE_LEVELS.map((level) => (
															<option key={level} value={level}>
																{intl.formatMessage({ id: `permissions.${level}` })}
															</option>
														))}
													</Field>
												</div>
											</div>
										))}
									</div>
								) : null}
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
