import { IconRefresh, IconTrash, IconRefreshAlert } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert } from "react-bootstrap";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { useNavigate, useParams, Link } from "react-router-dom";
import { deleteNode, syncNode, type MetricsRange } from "src/api/backend";
import { Button, DateFormatter, Loading, LoadingPage } from "src/components";
import {
	useDeadHosts,
	useNode,
	useNodeApplyLog,
	useNodeMetrics,
	useProxyHosts,
	useRedirectionHosts,
	useStreams,
} from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal } from "src/modals";
import { showNodeTokenModal } from "src/modals/NodeModal";
import { showError, showObjectSuccess } from "src/notifications";

const RANGES: { value: MetricsRange; label: string }[] = [
	{ value: "1h", label: "1h" },
	{ value: "24h", label: "24h" },
	{ value: "7d", label: "7d" },
	{ value: "30d", label: "30d" },
];

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

const bucketToEpoch = (bucket: string): number =>
	Date.parse(`${bucket.replace(" ", "T")}Z`);

const statusBadge = (status: string) => {
	if (status === "online")
		return (
			<span className="badge bg-success-lt">
				<T id="node.status.online" />
			</span>
		);
	if (status === "offline")
		return (
			<span className="badge bg-danger-lt">
				<T id="node.status.offline" />
			</span>
		);
	return (
		<span className="badge bg-secondary-lt">
			<T id="node.status.pending" />
		</span>
	);
};

export default function NodeDetail() {
	const { id: idStr } = useParams<{ id: string }>();
	const id = Number(idStr) || 0;
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: node, isLoading, isError, error } = useNode(id);
	const {
		data: applyLog = [],
		isFetching: logFetching,
		refetch: refetchLog,
	} = useNodeApplyLog(id);
	const [range, setRange] = useState<MetricsRange>("24h");
	const { data: metrics, isLoading: metricsLoading } = useNodeMetrics(id, range);
	const [expandedError, setExpandedError] = useState<number | null>(null);
	const [syncing, setSyncing] = useState(false);

	const { data: proxyHosts = [] } = useProxyHosts();
	const { data: redirectionHosts = [] } = useRedirectionHosts();
	const { data: deadHosts = [] } = useDeadHosts();
	const { data: streams = [] } = useStreams();

	const assignedHosts = useMemo(() => {
		const match = (h: any) => h.nodeId === id || h.nodeAll;
		return [
			...proxyHosts
				.filter(match)
				.map((h) => ({ type: "proxy", label: (h.domainNames || []).join(", "), id: h.id })),
			...redirectionHosts
				.filter(match)
				.map((h) => ({ type: "redirection", label: (h.domainNames || []).join(", "), id: h.id })),
			...deadHosts
				.filter(match)
				.map((h) => ({ type: "dead", label: (h.domainNames || []).join(", "), id: h.id })),
			...streams
				.filter(match)
				.map((h) => ({ type: "stream", label: String(h.incomingPort), id: h.id })),
		];
	}, [proxyHosts, redirectionHosts, deadHosts, streams, id]);

	const buckets = metrics?.buckets;
	const isEmpty = !metricsLoading && (buckets?.length ?? 0) === 0;

	const requestsSeries = useMemo(
		() => [
			{
				name: intl.formatMessage({ id: "metrics.requests" }),
				data: (buckets ?? []).map((b) => ({ x: bucketToEpoch(b.bucket), y: b.requests })),
			},
		],
		[buckets],
	);
	const bandwidthSeries = useMemo(
		() => [
			{
				name: intl.formatMessage({ id: "metrics.bandwidth" }),
				data: (buckets ?? []).map((b) => ({ x: bucketToEpoch(b.bucket), y: b.bytesSent })),
			},
		],
		[buckets],
	);

	const areaChartOptions: ApexOptions = {
		chart: { type: "area", toolbar: { show: false }, animations: { enabled: false } },
		xaxis: { type: "datetime", labels: { datetimeUTC: false } },
		stroke: { curve: "smooth", width: 2 },
		dataLabels: { enabled: false },
		tooltip: { x: { format: "dd MMM HH:mm" } },
		grid: { strokeDashArray: 4 },
	};
	const requestsOptions: ApexOptions = {
		...areaChartOptions,
		colors: ["#2fb344"],
		yaxis: { labels: { formatter: (v) => Math.round(v).toString() } },
	};
	const bandwidthOptions: ApexOptions = {
		...areaChartOptions,
		colors: ["#4299e1"],
		yaxis: { labels: { formatter: formatBytes } },
		tooltip: { x: { format: "dd MMM HH:mm" }, y: { formatter: formatBytes } },
	};

	const handleSync = async () => {
		if (syncing) return;
		setSyncing(true);
		try {
			await syncNode(id);
			showObjectSuccess("node", "synced");
			queryClient.invalidateQueries({ queryKey: ["node", id] });
		} catch (err: any) {
			showError(err?.message || "Sync failed");
		} finally {
			setSyncing(false);
		}
	};

	const handleDelete = async () => {
		await deleteNode(id);
		queryClient.invalidateQueries({ queryKey: ["nodes"] });
		showObjectSuccess("node", "deleted");
		navigate("/nodes");
	};

	if (isLoading) return <LoadingPage />;
	if (isError || !node) {
		return <Alert variant="danger">{error?.message || "Node not found"}</Alert>;
	}

	const hostTypeLabel: Record<string, string> = {
		proxy: "Proxy Host",
		redirection: "Redirect",
		dead: "404 Host",
		stream: "Stream",
	};
	const hostTypePath: Record<string, string> = {
		proxy: "/nginx/proxy",
		redirection: "/nginx/redirection",
		dead: "/nginx/404",
		stream: "/nginx/stream",
	};

	return (
		<div className="mt-4">
			{/* Header card */}
			<div className="card">
				<div className="card-status-top bg-azure" />
				<div className="card-header">
					<div className="row w-full align-items-center">
						<div className="col">
							<h2 className="mt-1 mb-0">{node.name}</h2>
							<div className="text-secondary small d-flex gap-2 align-items-center mt-1">
								{statusBadge(node.status)}
								{node.version && <span className="font-monospace">{node.version}</span>}
							</div>
						</div>
						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list">
								<Button
									size="sm"
									className="btn-azure"
									onClick={handleSync}
									isLoading={syncing}
									disabled={syncing}
								>
									<IconRefreshAlert size={16} />
									<span className="ms-1">
										<T id="node.force-sync" />
									</span>
								</Button>
								<Button
									size="sm"
									className="btn-secondary"
									onClick={() => showNodeTokenModal(node.id, node.name)}
								>
									<IconRefresh size={16} />
									<span className="ms-1">
										<T id="node.regenerate-token" />
									</span>
								</Button>
								<Button
									size="sm"
									className="btn-danger"
									onClick={() =>
										showDeleteConfirmModal({
											title: <T id="object.delete" tData={{ object: "node" }} />,
											onConfirm: handleDelete,
											children: <T id="node.delete.content" />,
										})
									}
								>
									<IconTrash size={16} />
									<span className="ms-1">
										<T id="object.delete" tData={{ object: "node" }} />
									</span>
								</Button>
							</div>
						</div>
					</div>
				</div>
				<div className="card-body">
					<div className="row g-3">
						<div className="col-6 col-md-3">
							<div className="text-muted small">
								<T id="column.status" />
							</div>
							<div>{statusBadge(node.status)}</div>
						</div>
						<div className="col-6 col-md-3">
							<div className="text-muted small">
								<T id="node.agent-version" />
							</div>
							<div className="font-monospace">{node.version || "—"}</div>
						</div>
						<div className="col-6 col-md-3">
							<div className="text-muted small">
								<T id="node.config-version" />
							</div>
							<div className="font-monospace">v{node.configVersion || 0}</div>
						</div>
						<div className="col-6 col-md-3">
							<div className="text-muted small">
								<T id="node.last-seen" />
							</div>
							<div>
								{node.lastSeen ? (
									<DateFormatter value={node.lastSeen} />
								) : (
									<span className="text-secondary">
										<T id="node.never-seen" />
									</span>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Apply History card */}
			<div className="card mt-4">
				<div className="card-header">
					<div className="row w-full align-items-center">
						<div className="col">
							<h3 className="card-title">
								<T id="node.apply-history" />
							</h3>
						</div>
						<div className="col-auto">
							<Button
								size="sm"
								className="btn-secondary"
								onClick={() => refetchLog()}
								disabled={logFetching}
							>
								<IconRefresh size={16} />
							</Button>
						</div>
					</div>
				</div>
				<div className="card-body p-0">
					{logFetching && applyLog.length === 0 ? (
						<div className="p-4">
							<Loading noLogo />
						</div>
					) : applyLog.length === 0 ? (
						<div className="text-center text-muted py-4">
							<T id="node.apply-log.empty" />
						</div>
					) : (
						<div className="table-responsive">
							<table className="table table-vcenter card-table">
								<thead>
									<tr>
										<th>
											<T id="node.apply-log.version" />
										</th>
										<th>
											<T id="node.apply-log.result" />
										</th>
										<th>
											<T id="column.created-on" />
										</th>
									</tr>
								</thead>
								<tbody>
									{applyLog.map((entry) => (
										<tr key={entry.id}>
											<td className="font-monospace">v{entry.version}</td>
											<td>
												{entry.ok ? (
													<span className="badge bg-success-lt">
														<T id="node.apply-log.ok" />
													</span>
												) : (
													<>
														<span className="badge bg-danger-lt">
															<T id="node.apply-log.failed" />
														</span>
														{entry.error && (
															<>
																{" "}
																<button
																	type="button"
																	className="btn btn-link btn-sm p-0 ms-1"
																	onClick={() =>
																		setExpandedError(
																			expandedError === entry.id ? null : entry.id,
																		)
																	}
																>
																	{expandedError === entry.id ? "▲" : "▼"}
																</button>
																{expandedError === entry.id && (
																	<div className="mt-1">
																		<code className="small text-danger">{entry.error}</code>
																	</div>
																)}
															</>
														)}
													</>
												)}
											</td>
											<td>
												<DateFormatter value={entry.createdOn} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>

			{/* Traffic card */}
			<div className="card mt-4">
				<div className="card-header">
					<div className="row w-full align-items-center">
						<div className="col">
							<h3 className="card-title">
								<T id="node.traffic" />
							</h3>
						</div>
						<div className="col-auto d-flex align-items-center gap-2">
							<label className="form-label mb-0 fw-semibold small">
								<T id="metrics.range" />:
							</label>
							<select
								className="form-select form-select-sm w-auto"
								value={range}
								onChange={(e) => setRange(e.target.value as MetricsRange)}
							>
								{RANGES.map((r) => (
									<option key={r.value} value={r.value}>
										{r.label}
									</option>
								))}
							</select>
						</div>
					</div>
				</div>
				<div className="card-body">
					{metricsLoading && <Loading noLogo />}
					{isEmpty && (
						<div className="text-center text-muted py-4">
							<T id="metrics.no-data" />
						</div>
					)}
					{!metricsLoading && !isEmpty && (
						<>
							<div className="mb-4">
								<h6 className="text-muted mb-2">
									<T id="metrics.requests" />
								</h6>
								<ReactApexChart
									type="area"
									height={160}
									options={requestsOptions}
									series={requestsSeries}
								/>
							</div>
							<div className="mb-2">
								<h6 className="text-muted mb-2">
									<T id="metrics.bandwidth" />
								</h6>
								<ReactApexChart
									type="area"
									height={160}
									options={bandwidthOptions}
									series={bandwidthSeries}
								/>
							</div>
						</>
					)}
				</div>
			</div>

			{/* Assigned hosts card */}
			<div className="card mt-4">
				<div className="card-header">
					<h3 className="card-title">
						<T id="node.hosts" />
					</h3>
				</div>
				<div className="card-body p-0">
					{assignedHosts.length === 0 ? (
						<div className="text-center text-muted py-4">
							<T id="node.hosts.empty" />
						</div>
					) : (
						<div className="table-responsive">
							<table className="table table-vcenter card-table">
								<thead>
									<tr>
										<th>
											<T id="column.type" />
										</th>
										<th>
											<T id="column.name" />
										</th>
									</tr>
								</thead>
								<tbody>
									{assignedHosts.map((h) => (
										<tr key={`${h.type}-${h.id}`}>
											<td>
												<span className="badge bg-secondary-lt">{hostTypeLabel[h.type]}</span>
											</td>
											<td>
												<Link to={hostTypePath[h.type]}>{h.label || `#${h.id}`}</Link>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
