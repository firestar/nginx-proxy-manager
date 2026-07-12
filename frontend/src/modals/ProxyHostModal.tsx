import { IconSettings } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useEffect, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	AccessField,
	Button,
	CommonNginxOptionsFields,
	DomainNamesField,
	HasPermission,
	Loading,
	HeadersField,
	LocationsFields,
	NodeField,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
	TagsField,
} from "src/components";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateNumber, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { getMaintenancePage, saveMaintenancePage } from "src/api/backend";

const showProxyHostModal = (id: number | "new") => {
	EasyModal.show(ProxyHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const ProxyHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [maintenancePage, setMaintenancePage] = useState("");
	const [maintenancePageSaving, setMaintenancePageSaving] = useState(false);

	useEffect(() => {
		if (typeof id === "number") {
			getMaintenancePage(id).then((r) => setMaintenancePage(r.html));
		}
	}, [id]);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
			clientMaxBodySize: values.clientMaxBodySize?.trim() ? values.clientMaxBodySize : null,
			proxyConnectTimeout: values.proxyConnectTimeout === "" || values.proxyConnectTimeout === null || values.proxyConnectTimeout === undefined ? null : Number(values.proxyConnectTimeout),
			proxySendTimeout: values.proxySendTimeout === "" || values.proxySendTimeout === null || values.proxySendTimeout === undefined ? null : Number(values.proxySendTimeout),
			proxyReadTimeout: values.proxyReadTimeout === "" || values.proxyReadTimeout === null || values.proxyReadTimeout === undefined ? null : Number(values.proxyReadTimeout),
			proxyBuffering: values.proxyBuffering || null,
			nodeId: values.nodeAll ? null : values.nodeId || null,
			nodeAll: !!values.nodeAll,
		};

		setProxyHost(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("proxy-host", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && (error || userError) && (
				<Alert variant="danger" className="m-3">
					{error?.message || userError?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading || (userIsLoading && <Loading noLogo />)}
			{!isLoading && !userIsLoading && data && currentUser && (
				<Formik
					initialValues={
						{
							// Details tab
							domainNames: data?.domainNames || [],
							forwardScheme: data?.forwardScheme || "http",
							forwardHost: data?.forwardHost || "",
							forwardPort: data?.forwardPort || undefined,
							accessListId: data?.accessListId || 0,
							cachingEnabled: data?.cachingEnabled || false,
							blockExploits: data?.blockExploits || false,
							allowWebsocketUpgrade: data?.allowWebsocketUpgrade || false,
							tagIds: data?.tags?.map((t) => t.id) || data?.tagIds || [],
							// Locations tab
							nodeId: data?.nodeId || 0,
							nodeAll: data?.nodeAll || false,
							locations: data?.locations || [],
							headers: data?.headers || [],
							// SSL tab
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							http2Support: data?.http2Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							trustForwardedProto: data?.trustForwardedProto || false,
							// Advanced tab
							advancedConfig: data?.advancedConfig || "",
							meta: data?.meta || {},
							clientMaxBodySize: data?.clientMaxBodySize ?? null,
							proxyConnectTimeout: data?.proxyConnectTimeout ?? null,
							proxySendTimeout: data?.proxySendTimeout ?? null,
							proxyReadTimeout: data?.proxyReadTimeout ?? null,
							proxyBuffering: data?.proxyBuffering ?? null,
							// Uptime check tab
							checkEnabled: data?.checkEnabled || false,
							checkPath: data?.checkPath || "/",
							checkIntervalS: data?.checkIntervalS || 60,
							expectedStatus: data?.expectedStatus || "200-399",
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ values }: any) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "proxy-host" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<div className="card m-0 border-0">
									<div className="card-header">
										<ul className="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
											<li className="nav-item" role="presentation">
												<a
													href="#tab-details"
													className="nav-link active"
													data-bs-toggle="tab"
													aria-selected="true"
													role="tab"
												>
													<T id="column.details" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-locations"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.custom-locations" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-headers"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.headers" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-uptime"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													Uptime Check
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-ssl"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="column.ssl" />
												</a>
											</li>
											<li className="nav-item ms-auto" role="presentation">
												<a
													href="#tab-advanced"
													className="nav-link"
													title="Settings"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<IconSettings size={20} />
												</a>
											</li>
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
								<NodeField />
												<div className="row">
													<div className="col-md-3">
														<Field name="forwardScheme">
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label
																		className="form-label"
																		htmlFor="forwardScheme"
																	>
																		<T id="host.forward-scheme" />
																	</label>
																	<select
																		id="forwardScheme"
																		className={`form-control ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`}
																		required
																		{...field}
																	>
																		<option value="http">http</option>
																		<option value="https">https</option>
																	</select>
																	{form.errors.forwardScheme ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardScheme &&
																			form.touched.forwardScheme
																				? form.errors.forwardScheme
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-6">
														<Field name="forwardHost" validate={validateString(1, 255)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardHost">
																		<T id="proxy-host.forward-host" />
																	</label>
																	<input
																		id="forwardHost"
																		type="text"
																		className={`form-control ${form.errors.forwardHost && form.touched.forwardHost ? "is-invalid" : ""}`}
																		required
																		placeholder="example.com"
																		{...field}
																	/>
																	{form.errors.forwardHost ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardHost &&
																			form.touched.forwardHost
																				? form.errors.forwardHost
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-3">
														<Field name="forwardPort" validate={validateNumber(1, 65535)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardPort">
																		<T id="host.forward-port" />
																	</label>
																	<input
																		id="forwardPort"
																		type="number"
																		min={1}
																		max={65535}
																		className={`form-control ${form.errors.forwardPort && form.touched.forwardPort ? "is-invalid" : ""}`}
																		required
																		placeholder="eg: 8081"
																		{...field}
																	/>
																	{form.errors.forwardPort ? (
																		<div className="invalid-feedback">
																			{form.errors.forwardPort &&
																			form.touched.forwardPort
																				? form.errors.forwardPort
																				: null}
																		</div>
																	) : null}
																</div>
															)}
														</Field>
													</div>
												</div>
												<AccessField />
												<TagsField />
												<div className="my-3">
													<h4 className="py-2">
														<T id="options" />
													</h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="cachingEnabled">
																<span className="col">
																	<T id="host.flags.cache-assets" />
																</span>
																<span className="col-auto">
																	<Field name="cachingEnabled" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="cachingEnabled"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="blockExploits">
																<span className="col">
																	<T id="host.flags.block-exploits" />
																</span>
																<span className="col-auto">
																	<Field name="blockExploits" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="blockExploits"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="allowWebsocketUpgrade">
																<span className="col">
																	<T id="host.flags.websockets-upgrade" />
																</span>
																<span className="col-auto">
																	<Field name="allowWebsocketUpgrade" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="allowWebsocketUpgrade"
																					className={cn("form-check-input", {
																						"bg-lime": field.checked,
																					})}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
												</div>
											</div>
											<div className="tab-pane" id="tab-locations" role="tabpanel">
												<LocationsFields initialValues={data?.locations || []} />
											</div>
											<div className="tab-pane" id="tab-headers" role="tabpanel">
												<HeadersField initialValues={data?.headers || []} />
											</div>
											<div className="tab-pane" id="tab-uptime" role="tabpanel">
												<div className="my-3">
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="checkEnabled">
																<span className="col">Enable uptime checks</span>
																<span className="col-auto">
																	<Field name="checkEnabled" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="checkEnabled"
																					className={cn("form-check-input", { "bg-lime": field.checked })}
																					type="checkbox"
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
													<Field name="checkPath">
														{({ field }: any) => (
															<div className="mb-3 mt-3">
																<label className="form-label" htmlFor="checkPath">Check path</label>
																<input
																	id="checkPath"
																	type="text"
																	className="form-control"
																	placeholder="/"
																	{...field}
																/>
															</div>
														)}
													</Field>
													<div className="row">
														<div className="col-md-6">
															<Field name="checkIntervalS">
																{({ field }: any) => (
																	<div className="mb-3">
																		<label className="form-label" htmlFor="checkIntervalS">Check interval (seconds)</label>
																		<input
																			id="checkIntervalS"
																			type="number"
																			min={10}
																			max={3600}
																			className="form-control"
																			{...field}
																		/>
																	</div>
																)}
															</Field>
														</div>
														<div className="col-md-6">
															<Field name="expectedStatus">
																{({ field }: any) => (
																	<div className="mb-3">
																		<label className="form-label" htmlFor="expectedStatus">Expected status</label>
																		<input
																			id="expectedStatus"
																			type="text"
																			className="form-control"
																			placeholder="200-399"
																			{...field}
																		/>
																		<small className="form-hint">e.g. 200-399 or 200,301,404</small>
																	</div>
																)}
															</Field>
														</div>
													</div>
												</div>
											</div>
											<div className="tab-pane" id="tab-ssl" role="tabpanel">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
												/>
												<SSLOptionsFields color="bg-lime" forProxyHost={true} />
											</div>
											<div className="tab-pane" id="tab-advanced" role="tabpanel">
												<CommonNginxOptionsFields />
												<NginxConfigField guardedDirectives={[
													...values.clientMaxBodySize ? ["client_max_body_size"] : [],
													...values.proxyConnectTimeout != null ? ["proxy_connect_timeout"] : [],
													...values.proxySendTimeout != null ? ["proxy_send_timeout"] : [],
													...values.proxyReadTimeout != null ? ["proxy_read_timeout"] : [],
													...values.proxyBuffering ? ["proxy_buffering"] : [],
												]} />
												{id !== "new" && (
													<div className="mt-4">
														<label className="form-label fw-semibold">
															<T id="maintenance-page.html-label" />
														</label>
														<textarea
															className="form-control form-control-sm font-monospace"
															rows={8}
															value={maintenancePage}
															onChange={(e) => setMaintenancePage(e.target.value)}
															placeholder="Leave empty to use the built-in branded page"
														/>
														<Button
															size="sm"
															className="mt-2"
															isLoading={maintenancePageSaving}
															onClick={async () => {
																setMaintenancePageSaving(true);
																try {
																	await saveMaintenancePage(id as number, maintenancePage);
																	showObjectSuccess("proxy-host", "saved");
																} finally {
																	setMaintenancePageSaving(false);
																}
															}}
														>
															<T id="maintenance-page.save" />
														</Button>
													</div>
												)}
											</div>
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<Button
										type="submit"
										actionType="primary"
										className="ms-auto bg-lime"
										data-bs-dismiss="modal"
										isLoading={isSubmitting}
										disabled={isSubmitting}
									>
										<T id="save" />
									</Button>
								</HasPermission>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

export { showProxyHostModal };
