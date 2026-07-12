import { Field } from "formik";
import { useNodes } from "src/hooks";
import { intl, T } from "src/locale";

/**
 * Node selector: local, "All nodes (HA)", or a specific enrolled remote node.
 * Formik values: `nodeId` (number; 0 = local, sent as null) and `nodeAll`
 * (boolean; when true the host is replicated to every enrolled node).
 */
export function NodeField() {
	const { data: nodes } = useNodes();
	const remoteNodes = (nodes || []).filter((n) => n.status !== "pending");

	return (
		<Field name="nodeId">
			{({ field, form }: any) => {
				const selectValue = form.values.nodeAll ? -1 : field.value || 0;
				return (
					<div className="mb-3">
						<label className="form-label" htmlFor="nodeId">
							<T id="node" />
						</label>
						<select
							id="nodeId"
							className="form-control"
							value={selectValue}
							onChange={(e) => {
								const v = Number(e.target.value);
								if (v === -1) {
									form.setFieldValue("nodeAll", true);
									form.setFieldValue("nodeId", 0);
								} else {
									form.setFieldValue("nodeAll", false);
									form.setFieldValue("nodeId", v || 0);
								}
							}}
						>
							<option value={0}>{intl.formatMessage({ id: "node.local" })}</option>
							<option value={-1}>{intl.formatMessage({ id: "node.all" })}</option>
							{remoteNodes.map((n) => (
								<option key={n.id} value={n.id}>
									{n.name}
								</option>
							))}
						</select>
						<div className="form-hint">
							<T id="node.field-hint" />
						</div>
					</div>
				);
			}}
		</Field>
	);
}
