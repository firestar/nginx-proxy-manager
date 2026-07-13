import { useState } from "react";
import { Loading } from "src/components";
import { MetricsCharts } from "src/components/Metrics";
import { formatBytes } from "src/components/Metrics/utils";
import { useMetricsOverview } from "src/hooks";
import { T } from "src/locale";
import type { MetricsRange } from "src/api/backend";
import type { HostMetricsTotals } from "src/api/backend/getMetricsOverview";
import { showProxyHostMetricsModal } from "src/modals";

const RANGES: { value: MetricsRange; label: string }[] = [
	{ value: "1h", label: "1h" },
	{ value: "24h", label: "24h" },
	{ value: "7d", label: "7d" },
	{ value: "30d", label: "30d" },
];

const TOP_N = 10;

function HostBreakdownTable({ hosts }: { hosts: HostMetricsTotals[] }) {
	const [showAll, setShowAll] = useState(false);
	const visible = showAll ? hosts : hosts.slice(0, TOP_N);

	return (
		<div className="mt-4">
			<div className="table-responsive">
				<table className="table table-vcenter card-table table-hover">
					<thead>
						<tr>
							<th><T id="dashboard.traffic.breakdown-host" /></th>
							<th className="text-end"><T id="dashboard.traffic.breakdown-requests" /></th>
							<th className="text-end"><T id="dashboard.traffic.breakdown-bandwidth" /></th>
							<th className="text-end"><T id="dashboard.traffic.breakdown-error" /></th>
							<th className="text-end"><T id="dashboard.traffic.breakdown-cache" /></th>
						</tr>
					</thead>
					<tbody>
						{visible.map((h) => (
							<tr
								key={h.id}
								style={{ cursor: "pointer" }}
								onClick={() => showProxyHostMetricsModal(h.id)}
							>
								<td className="text-truncate" style={{ maxWidth: 240 }}>
									{h.domain_names[0]}
									{h.domain_names.length > 1 && (
										<span className="text-muted ms-1 small">+{h.domain_names.length - 1}</span>
									)}
								</td>
								<td className="text-end">{h.requests.toLocaleString()}</td>
								<td className="text-end">{formatBytes(h.bytesSent)}</td>
								<td className="text-end">{(h.errorRate * 100).toFixed(1)}%</td>
								<td className="text-end">{(h.cacheHitRate * 100).toFixed(1)}%</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{hosts.length > TOP_N && (
				<button
					type="button"
					className="btn btn-link btn-sm p-0"
					onClick={() => setShowAll((v) => !v)}
				>
					<T id={showAll ? "dashboard.traffic.show-less" : "dashboard.traffic.show-all"} />
					{!showAll && ` (${hosts.length - TOP_N} more)`}
				</button>
			)}
		</div>
	);
}

export function TrafficCard() {
	const [range, setRange] = useState<MetricsRange>("24h");
	const { data, isLoading, error } = useMetricsOverview(range);

	const isEmpty = !isLoading && !error && (data?.series?.length ?? 0) === 0;

	return (
		<div className="card mt-3">
			<div className="card-header">
				<h3 className="card-title">
					<T id="dashboard.traffic" />
				</h3>
				<div className="card-actions">
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
			<div className="card-body">
				{isLoading && <Loading noLogo />}

				{error && (
					<div className="text-danger small">{error.message}</div>
				)}

				{isEmpty && (
					<div className="text-center text-muted py-4">
						<T id="dashboard.traffic.no-data" />
					</div>
				)}

				{!isLoading && !error && !isEmpty && data && (
					<>
						<MetricsCharts buckets={data.series} totals={data.totals} />
						{data.hosts.length > 0 && <HostBreakdownTable hosts={data.hosts} />}
					</>
				)}
			</div>
		</div>
	);
}
