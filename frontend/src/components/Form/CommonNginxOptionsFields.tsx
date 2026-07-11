import { useFormikContext } from "formik";
import { T } from "src/locale";

export function CommonNginxOptionsFields() {
	const { values, setFieldValue } = useFormikContext<any>();

	const parseBodySize = (raw: string | null | undefined): { num: string; unit: string } => {
		if (!raw) return { num: "", unit: "m" };
		const match = raw.match(/^(\d+)([kmg]?)$/i);
		if (!match) return { num: "", unit: "m" };
		return { num: match[1], unit: match[2].toLowerCase() || "m" };
	};

	const { num: bodySizeNum, unit: bodySizeUnit } = parseBodySize(values.clientMaxBodySize);

	const handleBodySizeNum = (e: React.ChangeEvent<HTMLInputElement>) => {
		const n = e.target.value;
		if (!n) {
			setFieldValue("clientMaxBodySize", null);
		} else {
			setFieldValue("clientMaxBodySize", `${n}${bodySizeUnit}`);
		}
	};

	const handleBodySizeUnit = (e: React.ChangeEvent<HTMLSelectElement>) => {
		if (!bodySizeNum) return;
		setFieldValue("clientMaxBodySize", `${bodySizeNum}${e.target.value}`);
	};

	const handleTimeoutChange = (field: string, val: string) => {
		setFieldValue(field, val === "" ? null : Number(val));
	};

	const handleBufferingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setFieldValue("proxyBuffering", e.target.value || null);
	};

	return (
		<div className="mb-3">
			<h4 className="py-2">
				<T id="host.advanced.common-options" />
			</h4>
			<div className="row g-3">
				<div className="col-md-6">
					<label className="form-label">
						<T id="host.advanced.upload-size" />
					</label>
					<div className="input-group">
						<input
							type="number"
							className="form-control"
							min={1}
							placeholder=""
							value={bodySizeNum}
							onChange={handleBodySizeNum}
						/>
						<select
							className="form-select"
							style={{ maxWidth: "80px" }}
							value={bodySizeUnit}
							onChange={handleBodySizeUnit}
						>
							<option value="k">KB</option>
							<option value="m">MB</option>
							<option value="g">GB</option>
						</select>
					</div>
				</div>
				<div className="col-md-6">
					<label className="form-label">
						<T id="host.advanced.proxy-buffering" />
					</label>
					<select
						className="form-select"
						value={values.proxyBuffering ?? ""}
						onChange={handleBufferingChange}
					>
						<option value=""><T id="host.advanced.buffering-default" /></option>
						<option value="on"><T id="host.advanced.buffering-on" /></option>
						<option value="off"><T id="host.advanced.buffering-off" /></option>
					</select>
				</div>
				<div className="col-md-4">
					<label className="form-label">
						<T id="host.advanced.connect-timeout" />
					</label>
					<input
						type="number"
						className="form-control"
						min={1}
						placeholder=""
						value={values.proxyConnectTimeout ?? ""}
						onChange={(e) => handleTimeoutChange("proxyConnectTimeout", e.target.value)}
					/>
				</div>
				<div className="col-md-4">
					<label className="form-label">
						<T id="host.advanced.send-timeout" />
					</label>
					<input
						type="number"
						className="form-control"
						min={1}
						placeholder=""
						value={values.proxySendTimeout ?? ""}
						onChange={(e) => handleTimeoutChange("proxySendTimeout", e.target.value)}
					/>
				</div>
				<div className="col-md-4">
					<label className="form-label">
						<T id="host.advanced.read-timeout" />
					</label>
					<input
						type="number"
						className="form-control"
						min={1}
						placeholder=""
						value={values.proxyReadTimeout ?? ""}
						onChange={(e) => handleTimeoutChange("proxyReadTimeout", e.target.value)}
					/>
				</div>
			</div>
		</div>
	);
}
