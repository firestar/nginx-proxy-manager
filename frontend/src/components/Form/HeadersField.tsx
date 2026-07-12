import { useFormikContext } from "formik";
import { useState } from "react";
import type { ProxyHeader } from "src/api/backend";
import { T } from "src/locale";

interface Props {
	initialValues: ProxyHeader[];
	name?: string;
}

export function HeadersField({ initialValues, name = "headers" }: Props) {
	const [values, setValues] = useState<ProxyHeader[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();

	const blankItem: ProxyHeader = {
		direction: "request",
		action: "set",
		name: "",
		value: "",
	};

	const handleAdd = () => {
		const newValues = [...values, blankItem];
		setValues(newValues);
		setFieldValue(name, newValues);
	};

	const handleRemove = (idx: number) => {
		const newValues = values.filter((_: ProxyHeader, i: number) => i !== idx);
		setValues(newValues);
		setFieldValue(name, newValues);
	};

	const handleChange = (idx: number, field: string, fieldValue: string) => {
		const newValues = values.map((v: ProxyHeader, i: number) => (i === idx ? { ...v, [field]: fieldValue } : v));
		setValues(newValues);
		setFieldValue(name, newValues);
	};

	return (
		<>
			{values.map((item: ProxyHeader, idx: number) => (
				<div key={idx} className="card card-active mb-3">
					<div className="card-body">
						<div className="row g-2 align-items-end">
							<div className="col-md-3">
								<label className="form-label">
									<T id="host.headers.direction" />
								</label>
								<select
									className="form-select"
									value={item.direction}
									onChange={(e) => handleChange(idx, "direction", e.target.value)}
								>
									<option value="request">Request</option>
									<option value="response">Response</option>
								</select>
							</div>
							<div className="col-md-2">
								<label className="form-label">
									<T id="host.headers.action" />
								</label>
								<select
									className="form-select"
									value={item.action}
									onChange={(e) => handleChange(idx, "action", e.target.value)}
								>
									<option value="set">Set</option>
									<option value="remove">Remove</option>
								</select>
							</div>
							<div className="col-md-3">
								<label className="form-label">
									<T id="host.headers.name" />
								</label>
								<input
									type="text"
									className="form-control"
									placeholder="X-Custom-Header"
									autoComplete="off"
									value={item.name}
									onChange={(e) => handleChange(idx, "name", e.target.value)}
								/>
							</div>
							<div className="col-md-3">
								<label className="form-label">
									<T id="host.headers.value" />
								</label>
								<input
									type="text"
									className="form-control"
									placeholder="value"
									autoComplete="off"
									value={item.value}
									disabled={item.action === "remove"}
									onChange={(e) => handleChange(idx, "value", e.target.value)}
								/>
							</div>
							<div className="col-md-1 d-flex align-items-end">
								<button
									type="button"
									className="btn btn-sm btn-outline-danger w-100"
									onClick={() => handleRemove(idx)}
								>
									&times;
								</button>
							</div>
						</div>
					</div>
				</div>
			))}
			<div className="text-center">
				<button type="button" className="btn my-3" onClick={handleAdd}>
					<T id="action.add-header" />
				</button>
			</div>
		</>
	);
}
