import { useState } from "react";
import { Button } from "src/components";
import {
	useDeleteNotificationChannel,
	useNotificationChannels,
	useNotificationLogs,
	useTestNotificationChannel,
} from "src/hooks";
import { showNotificationChannelModal } from "src/modals/NotificationChannelModal";
import type { NotificationChannel } from "src/api/backend";

const EVENT_LABELS: Record<string, string> = {
	"host.offline": "Host Offline",
	"host.online": "Host Online",
	"certificate.expiring": "Cert Expiring",
	"certificate.renewal_failed": "Renewal Failed",
	"upstream.down": "Upstream Down",
	"upstream.up": "Upstream Up",
	"backup.ok": "Backup Succeeded",
	"backup.failed": "Backup Failed",
	"node.offline": "Node Offline",
	"node.online": "Node Online",
	"node.config_failed": "Node Config Apply Failed",
};

export default function Notifications() {
	const { data: channels = [], isLoading } = useNotificationChannels();
	const { data: logs = [] } = useNotificationLogs(50);
	const { mutate: deleteChannel } = useDeleteNotificationChannel();
	const { mutate: testChannel, data: testResult } = useTestNotificationChannel();
	const [testedId, setTestedId] = useState<number | null>(null);

	const handleTest = (channel: NotificationChannel) => {
		setTestedId(channel.id ?? null);
		testChannel(channel.id!);
	};

	if (isLoading) {
		return <div className="card-body">Loading...</div>;
	}

	return (
		<>
			<div className="card-body pb-0">
				<div className="d-flex align-items-center mb-3">
					<h3 className="mb-0">Notification Channels</h3>
					<Button
						className="ms-auto"
						actionType="primary"
						onClick={() => showNotificationChannelModal()}
					>
						Add Channel
					</Button>
				</div>

				{channels.length === 0 ? (
					<p className="text-muted">No channels configured. Add one to start receiving alerts.</p>
				) : (
					<div className="table-responsive">
						<table className="table table-vcenter">
							<thead>
								<tr>
									<th>Name</th>
									<th>Type</th>
									<th>Events</th>
									<th>Status</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{channels.map((ch) => (
									<tr key={ch.id}>
										<td>{ch.name}</td>
										<td>
											<span className="badge bg-blue-lt">{ch.type}</span>
										</td>
										<td>
											<div className="d-flex flex-wrap gap-1">
												{(ch.events || []).map((ev) => (
													<span key={ev} className="badge bg-azure-lt">
														{EVENT_LABELS[ev] ?? ev}
													</span>
												))}
											</div>
										</td>
										<td>
											{ch.enabled ? (
												<span className="badge bg-success-lt">Enabled</span>
											) : (
												<span className="badge bg-secondary-lt">Disabled</span>
											)}
										</td>
										<td className="text-end">
											<Button
												className="btn-sm me-1"
												onClick={() => handleTest(ch)}
											>
												Test
											</Button>
											<Button
												className="btn-sm me-1"
												onClick={() => showNotificationChannelModal(ch)}
											>
												Edit
											</Button>
											<Button
												className="btn-sm btn-danger"
												onClick={() => {
													if (confirm(`Delete channel "${ch.name}"?`)) {
														deleteChannel(ch.id!);
													}
												}}
											>
												Delete
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{testedId !== null && testResult !== undefined && (
					<div className={`alert mt-2 alert-${testResult.success ? "success" : "warning"}`}>
						{testResult.success ? "Test sent successfully." : `Test failed: ${testResult.error}`}
					</div>
				)}
			</div>

			<div className="card-body border-top mt-3">
				<h4 className="mb-3">Recent Deliveries</h4>
				{logs.length === 0 ? (
					<p className="text-muted">No delivery logs yet.</p>
				) : (
					<div className="table-responsive">
						<table className="table table-sm table-vcenter">
							<thead>
								<tr>
									<th>Time</th>
									<th>Event</th>
									<th>Status</th>
									<th>Detail</th>
								</tr>
							</thead>
							<tbody>
								{logs.map((log) => (
									<tr key={log.id}>
										<td className="text-muted text-nowrap">{new Date(log.createdOn).toLocaleString()}</td>
										<td>
											<span className="text-monospace small">{log.event}</span>
										</td>
										<td>
											{log.status === "sent" ? (
												<span className="badge bg-success-lt">sent</span>
											) : (
												<span className="badge bg-danger-lt">failed</span>
											)}
										</td>
										<td className="text-muted small">{log.detail ?? ""}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</>
	);
}
