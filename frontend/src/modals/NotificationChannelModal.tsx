import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import Modal from "react-bootstrap/Modal";
import type { NotificationChannel } from "src/api/backend";
import { Button } from "src/components";
import {
	useCreateNotificationChannel,
	useTestNotificationChannel,
	useUpdateNotificationChannel,
} from "src/hooks";
import { showObjectSuccess } from "src/notifications";

const CHANNEL_TYPES = [
	{ value: "webhook", label: "Generic Webhook" },
	{ value: "slack", label: "Slack" },
	{ value: "discord", label: "Discord" },
	{ value: "telegram", label: "Telegram" },
	{ value: "ntfy", label: "ntfy" },
	{ value: "email", label: "Email" },
] as const;

const ALL_EVENTS = [
	{ value: "host.offline", label: "Host Offline" },
	{ value: "host.online", label: "Host Online" },
	{ value: "certificate.expiring", label: "Certificate Expiring" },
	{ value: "certificate.renewal_failed", label: "Certificate Renewal Failed" },
	{ value: "upstream.down", label: "Upstream Down" },
	{ value: "upstream.up", label: "Upstream Up" },
	{ value: "backup.ok", label: "Backup Succeeded" },
	{ value: "backup.failed", label: "Backup Failed" },
	{ value: "node.offline", label: "Node Offline" },
	{ value: "node.online", label: "Node Online" },
	{ value: "node.config_failed", label: "Node Config Apply Failed" },
];

interface NotificationChannelModalProps extends InnerModalProps {
	channel?: NotificationChannel;
}

type ChannelType = NotificationChannel["type"];

const ConfigFields = ({ type }: { type: ChannelType }) => {
	switch (type) {
		case "webhook":
		case "slack":
		case "discord":
			return (
				<div className="mb-3">
					<label className="form-label">Webhook URL</label>
					<Field name="config.url" type="url" className="form-control" placeholder="https://" />
				</div>
			);
		case "telegram":
			return (
				<>
					<div className="mb-3">
						<label className="form-label">Bot Token</label>
						<Field name="config.bot_token" type="text" className="form-control" placeholder="123456:ABC..." />
					</div>
					<div className="mb-3">
						<label className="form-label">Chat ID</label>
						<Field name="config.chat_id" type="text" className="form-control" placeholder="-100..." />
					</div>
				</>
			);
		case "ntfy":
			return (
				<>
					<div className="mb-3">
						<label className="form-label">ntfy Server URL (optional, default: ntfy.sh)</label>
						<Field name="config.url" type="url" className="form-control" placeholder="https://ntfy.sh" />
					</div>
					<div className="mb-3">
						<label className="form-label">Topic</label>
						<Field name="config.topic" type="text" className="form-control" placeholder="nginx-proxy-manager" />
					</div>
				</>
			);
		case "email":
			return (
				<div className="mb-3">
					<label className="form-label">Recipient Email</label>
					<Field name="config.to" type="email" className="form-control" placeholder="admin@example.com" />
				</div>
			);
		default:
			return null;
	}
};

const NotificationChannelModal = EasyModal.create(({ channel, visible, remove }: NotificationChannelModalProps) => {
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [testResult, setTestResult] = useState<string | null>(null);
	const { mutateAsync: createChannel } = useCreateNotificationChannel();
	const { mutateAsync: updateChannel } = useUpdateNotificationChannel();
	const { mutateAsync: testChannel } = useTestNotificationChannel();

	const isEdit = !!channel?.id;

	const initialValues: NotificationChannel & { config: Record<string, any> } = {
		name: channel?.name ?? "",
		type: channel?.type ?? "webhook",
		config: channel?.config ?? {},
		events: channel?.events ?? [],
		enabled: channel?.enabled ?? true,
		...(isEdit ? { id: channel!.id } : {}),
	};

	const handleSubmit = async (values: typeof initialValues, { setSubmitting }: any) => {
		setErrorMsg(null);
		try {
			if (isEdit) {
				await updateChannel(values as NotificationChannel);
			} else {
				await createChannel(values);
			}
			showObjectSuccess("notification channel", isEdit ? "updated" : "created");
			remove();
		} catch (err: any) {
			setErrorMsg(err?.message ?? "Unknown error");
		} finally {
			setSubmitting(false);
		}
	};

	const handleTest = async (id: number) => {
		setTestResult(null);
		try {
			const res = await testChannel(id);
			setTestResult(res.success ? "Test sent successfully." : `Test failed: ${res.error}`);
		} catch (err: any) {
			setTestResult(`Error: ${err?.message}`);
		}
	};

	return (
		<Modal show={visible} onHide={remove} size="lg">
			<Formik initialValues={initialValues} onSubmit={handleSubmit}>
				{({ values, isSubmitting }) => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>{isEdit ? "Edit Notification Channel" : "Add Notification Channel"}</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							{errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
							{testResult && (
								<div className={`alert alert-${testResult.startsWith("Test sent") ? "success" : "warning"}`}>
									{testResult}
								</div>
							)}

							<div className="mb-3">
								<label className="form-label">Name</label>
								<Field name="name" type="text" className="form-control" placeholder="My Discord Alerts" />
							</div>

							<div className="mb-3">
								<label className="form-label">Type</label>
								<Field name="type" as="select" className="form-select">
									{CHANNEL_TYPES.map((t) => (
										<option key={t.value} value={t.value}>
											{t.label}
										</option>
									))}
								</Field>
							</div>

							<ConfigFields type={values.type} />

							<div className="mb-3">
								<label className="form-label">Events</label>
								<div>
									{ALL_EVENTS.map((ev) => (
										<div key={ev.value} className="form-check">
											<Field
												name="events"
												type="checkbox"
												value={ev.value}
												className="form-check-input"
												id={`event-${ev.value}`}
											/>
											<label className="form-check-label" htmlFor={`event-${ev.value}`}>
												{ev.label}
											</label>
										</div>
									))}
								</div>
							</div>

							<div className="mb-3">
								<div className="form-check form-switch">
									<Field name="enabled" type="checkbox" className="form-check-input" id="enabled" />
									<label className="form-check-label" htmlFor="enabled">
										Enabled
									</label>
								</div>
							</div>
						</Modal.Body>
						<Modal.Footer>
							{isEdit && (
								<Button
									type="button"
									className="me-auto"
									onClick={() => handleTest(channel!.id!)}
								>
									Send Test
								</Button>
							)}
							<Button type="button" onClick={remove}>
								Cancel
							</Button>
							<Button type="submit" actionType="primary" isLoading={isSubmitting}>
								{isEdit ? "Save" : "Create"}
							</Button>
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});

const showNotificationChannelModal = (channel?: NotificationChannel) => {
	EasyModal.show(NotificationChannelModal, { channel });
};

export { NotificationChannelModal, showNotificationChannelModal };
