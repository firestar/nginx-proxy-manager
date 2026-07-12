import { useParams } from "react-router-dom";
import { usePublicStatus } from "src/hooks";
import type { PublicStatusHost } from "src/api/backend";

function UptimeBar({ percent }: { percent: number }) {
	const clamped = Math.max(0, Math.min(100, percent));
	return (
		<div className="progress" style={{ height: 6 }}>
			<div
				className={`progress-bar ${clamped >= 95 ? "bg-lime" : clamped >= 70 ? "bg-yellow" : "bg-red"}`}
				style={{ width: `${clamped}%` }}
			/>
		</div>
	);
}

function HostRow({ host }: { host: PublicStatusHost }) {
	const isUp = host.status === "up";
	const isUnknown = host.status === "unknown";
	return (
		<div className="card mb-2">
			<div className="card-body py-2">
				<div className="d-flex align-items-center justify-content-between mb-1">
					<span className="fw-semibold">{host.name}</span>
					<span className={`status ${isUnknown ? "status-secondary" : isUp ? "status-lime" : "status-red"}`}>
						<span className={`status-dot ${!isUnknown ? "status-dot-animated" : ""}`} />
						{isUnknown ? "Unknown" : isUp ? "Operational" : "Outage"}
					</span>
				</div>
				<div className="row g-2 mt-1 small text-muted">
					<div className="col-4">
						<div>24h uptime</div>
						<UptimeBar percent={host.uptime.d1} />
						<div>{host.uptime.d1.toFixed(2)}%</div>
					</div>
					<div className="col-4">
						<div>7d uptime</div>
						<UptimeBar percent={host.uptime.d7} />
						<div>{host.uptime.d7.toFixed(2)}%</div>
					</div>
					<div className="col-4">
						<div>90d uptime</div>
						<UptimeBar percent={host.uptime.d90} />
						<div>{host.uptime.d90.toFixed(2)}%</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function PublicStatusPage() {
	const { slug } = useParams<{ slug: string }>();
	const { data, isLoading, isError, error } = usePublicStatus(slug ?? "");

	if (isLoading) {
		return (
			<div className="container py-5 text-center">
				<div className="spinner-border text-muted" role="status" />
			</div>
		);
	}

	if (isError || !data) {
		return (
			<div className="container py-5 text-center">
				<h1 className="mb-3">Status page not found</h1>
				<p className="text-muted">{error?.message ?? "This status page does not exist or is not enabled."}</p>
			</div>
		);
	}

	const allUp = data.hosts.every((h) => h.status === "up");
	const anyDown = data.hosts.some((h) => h.status === "down");

	return (
		<div className="container py-5" style={{ maxWidth: 700 }}>
			<div className="text-center mb-4">
				<h1>{data.title}</h1>
				<div
					className={`alert ${anyDown ? "alert-danger" : allUp ? "alert-success" : "alert-warning"} mt-3`}
				>
					{anyDown ? "Some services are experiencing issues." : allUp ? "All systems operational." : "Checking status…"}
				</div>
			</div>

			{data.hosts.length === 0 ? (
				<p className="text-center text-muted">No monitored services configured.</p>
			) : (
				data.hosts.map((host) => <HostRow key={host.name} host={host} />)
			)}

			<p className="text-center text-muted mt-4 small">
				Last updated: {new Date(data.generated_on).toLocaleString()}
			</p>
		</div>
	);
}
