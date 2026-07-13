import { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { T } from "src/locale";
import type { MetricsBucket, ProxyHostMetricsTotals } from "src/api/backend";
import { bucketToEpoch, formatBytes } from "./utils";

const BASE_AREA_OPTIONS: ApexOptions = {
	chart: { type: "area", toolbar: { show: false }, animations: { enabled: false } },
	xaxis: { type: "datetime", labels: { datetimeUTC: false } },
	stroke: { curve: "smooth", width: 2 },
	dataLabels: { enabled: false },
	tooltip: { x: { format: "dd MMM HH:mm" } },
	grid: { strokeDashArray: 4 },
};

interface ChartsProps {
	buckets: MetricsBucket[];
	totals?: ProxyHostMetricsTotals;
}

export function MetricsCharts({ buckets, totals }: ChartsProps) {
	const requestsSeries = useMemo(
		() => [{ name: "Requests", data: buckets.map((b) => ({ x: bucketToEpoch(b.bucket), y: b.requests })) }],
		[buckets],
	);
	const bandwidthSeries = useMemo(
		() => [{ name: "Bandwidth", data: buckets.map((b) => ({ x: bucketToEpoch(b.bucket), y: b.bytesSent })) }],
		[buckets],
	);
	const statusSeries = useMemo(
		() =>
			(["status2xx", "status3xx", "status4xx", "status5xx"] as const).map((key, i) => ({
				name: ["2xx", "3xx", "4xx", "5xx"][i],
				data: buckets.map((b) => ({ x: bucketToEpoch(b.bucket), y: b[key] })),
			})),
		[buckets],
	);

	const requestsOptions: ApexOptions = useMemo(
		() => ({
			...BASE_AREA_OPTIONS,
			colors: ["#2fb344"],
			yaxis: { labels: { formatter: (v: number) => Math.round(v).toString() } },
		}),
		[],
	);

	const bandwidthOptions: ApexOptions = useMemo(
		() => ({
			...BASE_AREA_OPTIONS,
			colors: ["#4299e1"],
			yaxis: { labels: { formatter: formatBytes } },
			tooltip: { x: { format: "dd MMM HH:mm" }, y: { formatter: formatBytes } },
		}),
		[],
	);

	const statusBarOptions: ApexOptions = useMemo(
		() => ({
			chart: { type: "bar", stacked: true, toolbar: { show: false }, animations: { enabled: false } },
			xaxis: { type: "datetime", labels: { datetimeUTC: false } },
			dataLabels: { enabled: false },
			colors: ["#2fb344", "#f59f00", "#e53e3e", "#7c3aed"],
			grid: { strokeDashArray: 4 },
			tooltip: { x: { format: "dd MMM HH:mm" } },
		}),
		[],
	);

	return (
		<>
			<div className="mb-4">
				<h6 className="text-muted mb-2">
					<T id="metrics.requests" />
				</h6>
				<ReactApexChart type="area" height={160} options={requestsOptions} series={requestsSeries} />
			</div>

			<div className="mb-4">
				<h6 className="text-muted mb-2">
					<T id="metrics.bandwidth" />
				</h6>
				<ReactApexChart type="area" height={160} options={bandwidthOptions} series={bandwidthSeries} />
			</div>

			<div className="mb-4">
				<h6 className="text-muted mb-2">
					<T id="metrics.status-codes" />
				</h6>
				<ReactApexChart type="bar" height={160} options={statusBarOptions} series={statusSeries} />
			</div>

			{totals && <MetricsSummaryTiles totals={totals} />}
		</>
	);
}

interface TilesProps {
	totals: ProxyHostMetricsTotals;
}

export function MetricsSummaryTiles({ totals }: TilesProps) {
	return (
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
	);
}
