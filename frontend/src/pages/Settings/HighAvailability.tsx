import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { useSetSetting, useSetting } from "src/hooks";
import { showObjectSuccess } from "src/notifications";

/**
 * Multi-node / HA settings. Currently the ACME Relay URL: the panel's public
 * HTTP address that remote-node agents forward /.well-known/acme-challenge/*
 * requests to, so HTTP-01 certificates can be issued for hosts pinned to (or
 * replicated across) remote nodes.
 */
export default function HighAvailability() {
	const { data, isLoading, error } = useSetting("acme-relay-url");
	const { mutate: setSetting } = useSetSetting();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		setSetting(
			{ id: "acme-relay-url", value: (values.relayUrl || "").trim(), meta: {} },
			{
				onError: (err: any) => setErrorMsg(err.message),
				onSuccess: () => showObjectSuccess("acme-relay-url", "saved"),
				onSettled: () => {
					setIsSubmitting(false);
					setSubmitting(false);
				},
			},
		);
	};

	if (isLoading) return <Loading noLogo />;
	if (error) return <Alert variant="danger">{error.message}</Alert>;

	return (
		<Formik initialValues={{ relayUrl: data?.value || "" }} onSubmit={onSubmit} enableReinitialize>
			{() => (
				<Form>
					{errorMsg && (
						<Alert variant="danger" dismissible onClose={() => setErrorMsg(null)}>
							{errorMsg}
						</Alert>
					)}

					<div className="card-body">
						<h4 className="mb-3">High Availability</h4>

						<Field name="relayUrl">
							{({ field }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="acmeRelayUrl">
										ACME Relay URL
									</label>
									<input
										id="acmeRelayUrl"
										type="text"
										className="form-control"
										placeholder="http://panel.example.com"
										{...field}
									/>
									<small className="form-hint">
										Public HTTP address of this panel. When set, hosts on remote nodes may use HTTP-01
										certificates: agents relay <code>/.well-known/acme-challenge/*</code> back here for the
										panel to answer. Leave blank to require DNS-challenge or custom certificates on remote
										nodes. Must start with <code>http://</code> or <code>https://</code>.
									</small>
								</div>
							)}
						</Field>
					</div>

					<div className="card-footer text-end">
						<Button type="submit" actionType="primary" className="bg-lime" isLoading={isSubmitting} disabled={isSubmitting}>
							Save
						</Button>
					</div>
				</Form>
			)}
		</Formik>
	);
}
