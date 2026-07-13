import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useState } from "react";
import { Alert, Modal } from "react-bootstrap";
import { useProxyHostMetrics } from "src/hooks";
import { T } from "src/locale";
import type { MetricsRange } from "src/api/backend";
import { Loading } from "src/components";
import { MetricsCharts } from "src/components/Metrics";

const RANGES: { value: MetricsRange; label: string }[] = [
	{ value: "1h", label: "1h" },
	{ value: "24h", label: "24h" },
	{ value: "7d", label: "7d" },
	{ value: "30d", label: "30d" },
];

const showProxyHostMetricsModal = (id: number) => {
	EasyModal.show(ProxyHostMetricsModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}

const ProxyHostMetricsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [range, setRange] = useState<MetricsRange>("24h");
	const { data, isLoading, error } = useProxyHostMetrics(id, range);

	const buckets = data?.buckets;
	const totals = data?.totals;
	const isEmpty = !isLoading && !error && (buckets?.length ?? 0) === 0;

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

				{!isLoading && !error && !isEmpty && buckets && totals && (
					<MetricsCharts buckets={buckets} totals={totals} />
				)}
			</Modal.Body>
		</Modal>
	);
});

export { showProxyHostMetricsModal };
