import CodeEditor from "@uiw/react-textarea-code-editor";
import { Field } from "formik";
import { intl, T } from "src/locale";

interface Props {
	id?: string;
	name?: string;
	label?: string;
	/** Directive names emitted by the template when a structured field is set. Non-blocking warning shown if any appear in the config. */
	guardedDirectives?: string[];
}

/** Returns top-level (depth-0) directive names from an nginx config snippet. */
function getTopLevelDirectiveNames(config: string): string[] {
	const names: string[] = [];
	let depth = 0;
	let i = 0;
	while (i < config.length) {
		const ch = config[i];
		if (ch === "#") {
			while (i < config.length && config[i] !== "\n") i++;
			continue;
		}
		if (ch === "{") { depth++; i++; continue; }
		if (ch === "}") { if (depth > 0) depth--; i++; continue; }
		if (ch === ";") { i++; continue; }
		if (depth === 0 && /\S/.test(ch)) {
			let name = "";
			while (i < config.length && /\S/.test(config[i]) && config[i] !== "{" && config[i] !== ";" && config[i] !== "#" && config[i] !== "\n") {
				name += config[i++];
			}
			if (name) names.push(name);
			while (i < config.length && config[i] !== ";" && config[i] !== "{" && config[i] !== "}") {
				if (config[i] === "#") { while (i < config.length && config[i] !== "\n") i++; continue; }
				i++;
			}
			continue;
		}
		i++;
	}
	return names;
}

export function NginxConfigField({
	name = "advancedConfig",
	label = "nginx-config.label",
	id = "advancedConfig",
	guardedDirectives,
}: Props) {
	return (
		<Field name={name}>
			{({ field }: any) => {
				const conflicts =
					guardedDirectives && field.value
						? getTopLevelDirectiveNames(field.value).filter((d) => guardedDirectives.includes(d))
						: [];
				return (
					<div className="mt-3">
						<label htmlFor={id} className="form-label">
							<T id={label} />
						</label>
						<CodeEditor
							language="nginx"
							placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
							padding={15}
							data-color-mode="dark"
							minHeight={200}
							indentWidth={2}
							style={{
								fontFamily: "ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
								borderRadius: "0.3rem",
								minHeight: "200px",
								backgroundColor: "var(--tblr-bg-surface-dark)",
							}}
							{...field}
						/>
						{conflicts.length > 0 && (
							<div className="alert alert-warning mt-2 py-2 px-3 mb-0">
								<strong>Warning:</strong> directive{conflicts.length > 1 ? "s" : ""}{" "}
								<code>{conflicts.join(", ")}</code> will also be emitted by the structured settings above — this will cause a conflict on save. Remove from Advanced Config or clear the structured field.
							</div>
						)}
					</div>
				);
			}}
		</Field>
	);
}
