import cn from "classnames";
import { useFormikContext } from "formik";
import type { ProxyUpstream } from "src/api/backend";
import { intl, T } from "src/locale";

// Phase A load balancing: edit the upstream pool (host/port/weight/backup) and
// the balance method. maxFails/failTimeout are preserved through edits but are
// not exposed as columns here (set them via the API/MCP).
export function LoadBalancingField() {
	const { values, setFieldValue, errors } = useFormikContext<any>();
	const upstreams: ProxyUpstream[] | null = Array.isArray(values.upstreams) ? values.upstreams : null;
	const enabled = upstreams !== null;
	const upstreamError = errors?.upstreams as string | undefined;

	const write = (next: ProxyUpstream[]) => setFieldValue("upstreams", next);

	const toggle = (on: boolean) => {
		if (on) {
			// Seed the first row from the current single-target host/port.
			write([{ host: values.forwardHost || "", port: values.forwardPort || 80, weight: 1 }]);
			if (values.balanceMethod === undefined) {
				setFieldValue("balanceMethod", null);
			}
		} else {
			// Preserve forwardHost/forwardPort; just drop the pool.
			setFieldValue("upstreams", null);
		}
	};

	const addRow = () => write([...(upstreams || []), { host: "", port: 80, weight: 1 }]);
	const removeRow = (idx: number) => write((upstreams || []).filter((_, i) => i !== idx));
	const changeRow = (idx: number, field: keyof ProxyUpstream, val: unknown) =>
		write((upstreams || []).map((u, i) => (i === idx ? { ...u, [field]: val } : u)));

	return (
		<div className="my-3">
			<label className="row" htmlFor="loadBalancing">
				<span className="col">
					<T id="host.load-balancing" />
				</span>
				<span className="col-auto">
					<label className="form-check form-check-single form-switch">
						<input
							id="loadBalancing"
							type="checkbox"
							className={cn("form-check-input", { "bg-lime": enabled })}
							checked={enabled}
							onChange={(e) => toggle(e.target.checked)}
						/>
					</label>
				</span>
			</label>

			{enabled && (
				<div className="mt-3">
					<div className="mb-3">
						<label className="form-label" htmlFor="balanceMethod">
							<T id="host.balance-method" />
						</label>
						<select
							id="balanceMethod"
							className="form-select"
							value={values.balanceMethod ?? ""}
							onChange={(e) => setFieldValue("balanceMethod", e.target.value || null)}
						>
							<option value="">{intl.formatMessage({ id: "host.balance-method.round-robin" })}</option>
							<option value="least_conn">
								{intl.formatMessage({ id: "host.balance-method.least-conn" })}
							</option>
							<option value="ip_hash">{intl.formatMessage({ id: "host.balance-method.ip-hash" })}</option>
						</select>
					</div>

					{(upstreams || []).map((u, idx) => (
						<div key={idx} className="card card-active mb-2">
							<div className="card-body">
								<div className="row g-2 align-items-end">
									<div className="col-md-5">
										<label className="form-label" htmlFor={`upstream-host-${idx}`}>
											<T id="host.upstream.host" />
										</label>
										<input
											id={`upstream-host-${idx}`}
											type="text"
											className="form-control"
											placeholder="10.0.0.2"
											autoComplete="off"
											value={u.host}
											onChange={(e) => changeRow(idx, "host", e.target.value)}
										/>
									</div>
									<div className="col-md-2">
										<label className="form-label" htmlFor={`upstream-port-${idx}`}>
											<T id="host.forward-port" />
										</label>
										<input
											id={`upstream-port-${idx}`}
											type="number"
											min={1}
											max={65535}
											className="form-control"
											value={u.port ?? ""}
											onChange={(e) =>
												changeRow(
													idx,
													"port",
													e.target.value === "" ? "" : Number(e.target.value),
												)
											}
										/>
									</div>
									<div className="col-md-2">
										<label className="form-label" htmlFor={`upstream-weight-${idx}`}>
											<T id="host.upstream.weight" />
										</label>
										<input
											id={`upstream-weight-${idx}`}
											type="number"
											min={1}
											className="form-control"
											value={u.weight ?? ""}
											onChange={(e) =>
												changeRow(
													idx,
													"weight",
													e.target.value === "" ? undefined : Number(e.target.value),
												)
											}
										/>
									</div>
									<div className="col-md-2 d-flex align-items-center">
										<label className="form-check form-check-single form-switch mb-0">
											<input
												type="checkbox"
												className={cn("form-check-input", { "bg-lime": !!u.backup })}
												checked={!!u.backup}
												onChange={(e) => changeRow(idx, "backup", e.target.checked)}
											/>
											<span className="form-check-label ms-1">
												<T id="host.upstream.backup" />
											</span>
										</label>
									</div>
									<div className="col-md-1 d-flex align-items-end">
										<button
											type="button"
											className="btn btn-sm btn-outline-danger w-100"
											onClick={() => removeRow(idx)}
										>
											&times;
										</button>
									</div>
								</div>
							</div>
						</div>
					))}

					{upstreamError ? <div className="text-danger small mb-2">{<T id={upstreamError} />}</div> : null}

					<div className="text-center">
						<button type="button" className="btn my-2" onClick={addRow}>
							<T id="action.add-upstream" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
