import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useState } from "react";
import { Alert, Modal } from "react-bootstrap";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { useProxyHostMetrics } from "src/hooks";
import { T } from "src/locale";
import type { MetricsRange } from "src/api/backend";
import { Loading } from "src/components";

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

const showProxyHostMetricsModal = (id: number) => {
	EasyModal.show(ProxyHostMetricsModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}

const ProxyHostMetricsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [range, setRange] = useState<MetricsRange>("24h");
	const { data, isLoading, error } = useProxyHostMetrics(id, range);

	const buckets = data?.buckets ?? [];
	const totals = data?.totals;
	const labels = buckets.map((b) => b.bucket);
	const isEmpty = !isLoading && !error && buckets.length === 0;

	const areaChartOptions: ApexOptions = {
		chart: { type: "area", toolbar: { show: false }, animations: { enabled: false } },
		xaxis: { categories: labels, labels: { show: false } },
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
		tooltip: { y: { formatter: formatBytes } },
	};

	const statusBarOptions: ApexOptions = {
		chart: { type: "bar", stacked: true, toolbar: { show: false }, animations: { enabled: false } },
		xaxis: { categories: labels, labels: { show: false } },
		dataLabels: { enabled: false },
		colors: ["#2fb344", "#f59f00", "#e53e3e", "#7c3aed"],
		grid: { strokeDashArray: 4 },
		tooltip: { x: { format: "dd MMM HH:mm" } },
	};

	return (
		<Modal show={visible} onHide={remove} size="lg">
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="metrics" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				{error && (
					<Alert variant="danger">{error.message || "Unknown error"}</Alert>
				)}

				<div className="d-flex align-items-center mb-3 gap-2">
					<label className="form-label mb-0 fw-semibold">
						<T id="metrics.range" />:
					</label>
					<select
						className="form-select w-auto"
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

				{isLoading && <Loading noLogo />}

				{isEmpty && (
					<div className="text-center text-muted py-5">
						<T id="metrics.no-data" />
					</div>
				)}

				{!isLoading && !error && !isEmpty && (
					<>
						<div className="mb-4">
							<h6 className="text-muted mb-2">
								<T id="metrics.requests" />
							</h6>
							<ReactApexChart
								type="area"
								height={160}
								options={requestsOptions}
								series={[{ name: "Requests", data: buckets.map((b) => b.requests) }]}
							/>
						</div>

						<div className="mb-4">
							<h6 className="text-muted mb-2">
								<T id="metrics.bandwidth" />
							</h6>
							<ReactApexChart
								type="area"
								height={160}
								options={bandwidthOptions}
								series={[{ name: "Bandwidth", data: buckets.map((b) => b.bytesSent) }]}
							/>
						</div>

						<div className="mb-4">
							<h6 className="text-muted mb-2">
								<T id="metrics.status-codes" />
							</h6>
							<ReactApexChart
								type="bar"
								height={160}
								options={statusBarOptions}
								series={[
									{ name: "2xx", data: buckets.map((b) => b.status2xx) },
									{ name: "3xx", data: buckets.map((b) => b.status3xx) },
									{ name: "4xx", data: buckets.map((b) => b.status4xx) },
									{ name: "5xx", data: buckets.map((b) => b.status5xx) },
								]}
							/>
						</div>

						{totals && (
							<div className="row g-3 text-center">
								<div className="col-6 col-md-3">
									<div className="fw-semibold">{totals.requests.toLocaleString()}</div>
									<div className="text-muted small">
										<T id="metrics.total-requests" />
									</div>
								</div>
								<div className="col-6 col-md-3">
									<div className="fw-semibold">{formatBytes(totals.bytesSent)}</div>
									<div className="text-muted small">
										<T id="metrics.total-bandwidth" />
									</div>
								</div>
								<div className="col-6 col-md-3">
									<div className="fw-semibold">{(totals.cacheHitRatio * 100).toFixed(1)}%</div>
									<div className="text-muted small">
										<T id="metrics.cache-hit" />
									</div>
								</div>
								<div className="col-6 col-md-3">
									<div className="fw-semibold">{(totals.errorRate * 100).toFixed(1)}%</div>
									<div className="text-muted small">
										<T id="metrics.error-rate" />
									</div>
								</div>
							</div>
						)}
					</>
				)}
			</Modal.Body>
		</Modal>
	);
});

export { showProxyHostMetricsModal };
