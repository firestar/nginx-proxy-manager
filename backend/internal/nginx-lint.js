import errs from "../lib/error.js";

/**
 * Directives emitted by the proxy_host template when the corresponding
 * structured field is set. Keyed by directive name → host field name.
 */
const GUARDED_DIRECTIVES = {
	client_max_body_size: "client_max_body_size",
	proxy_connect_timeout: "proxy_connect_timeout",
	proxy_send_timeout: "proxy_send_timeout",
	proxy_read_timeout: "proxy_read_timeout",
	proxy_buffering: "proxy_buffering",
};

/**
 * Tokenize top-level (depth-0) directive names from an nginx config snippet.
 * Skips content inside { } blocks and # line-comments.
 *
 * @param   {String} config
 * @returns {Array<{name: string, line: number}>}
 */
export function tokenizeTopLevel(config) {
	const directives = [];
	let depth = 0;
	let i = 0;
	let line = 1;

	while (i < config.length) {
		const ch = config[i];

		if (ch === "\n") {
			line++;
			i++;
			continue;
		}

		// Skip # comments to end-of-line.
		if (ch === "#") {
			while (i < config.length && config[i] !== "\n") {
				i++;
			}
			continue;
		}

		if (ch === "{") {
			depth++;
			i++;
			continue;
		}

		if (ch === "}") {
			if (depth > 0) depth--;
			i++;
			continue;
		}

		if (ch === ";") {
			i++;
			continue;
		}

		// At depth 0, collect the first token (directive name).
		if (depth === 0 && /\S/.test(ch)) {
			let name = "";
			const startLine = line;
			while (i < config.length && /\S/.test(config[i]) && config[i] !== "{" && config[i] !== ";" && config[i] !== "#") {
				if (config[i] === "\n") break;
				name += config[i];
				i++;
			}
			if (name) {
				directives.push({ name, line: startLine });
			}
			// Skip the rest of the statement (until ; or {).
			while (i < config.length && config[i] !== ";" && config[i] !== "{" && config[i] !== "}") {
				if (config[i] === "\n") line++;
				if (config[i] === "#") {
					while (i < config.length && config[i] !== "\n") i++;
					continue;
				}
				i++;
			}
			continue;
		}

		i++;
	}

	return directives;
}

/**
 * Check for duplicate directives between advanced_config and template-emitted
 * directives. Throws ValidationError (400) if conflict found.
 *
 * Only applies to proxy hosts (other host types don't have these structured fields).
 *
 * @param {String} advancedConfig
 * @param {Object} host  — the host data object (snake_case field names)
 */
export function check(advancedConfig, host) {
	if (!advancedConfig) return;

	const directives = tokenizeTopLevel(advancedConfig);

	for (const { name, line } of directives) {
		const fieldName = GUARDED_DIRECTIVES[name];
		if (fieldName && host[fieldName]) {
			throw new errs.ValidationError(
				`advanced_config directive "${name}" (line ${line}) conflicts with the "${fieldName}" setting — remove it from Advanced Config or clear the structured field`,
			);
		}
	}
}

export default { tokenizeTopLevel, check };
