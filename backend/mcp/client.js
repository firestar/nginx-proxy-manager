/**
 * Loopback API client for MCP tools. Every tool call is a real HTTP request
 * to this same backend with the MCP caller's own bearer token, so request
 * validation, permissions and API key scopes are enforced exactly as if the
 * caller had hit the API directly.
 */

// The backend always listens on 3000 (see index.js); nginx fronts it on 81.
const BASE = "http://127.0.0.1:3000";

class NpmApiError extends Error {
	constructor(message, status, body) {
		super(message);
		this.name = "NpmApiError";
		this.status = status;
		this.body = body;
	}
}

/**
 * @param   {String}      token   Bearer value of the MCP caller
 * @param   {Array|null}  scopes  API key scopes, null = unrestricted
 * @returns {Object}      ctx passed to tool registrars
 */
const createApiContext = (token, scopes) => {
	const request = async (method, path, options = {}) => {
		const url = new URL(`${BASE}${path.startsWith("/") ? path : `/${path}`}`);
		if (options.query) {
			for (const [key, value] of Object.entries(options.query)) {
				if (value !== undefined) {
					url.searchParams.set(key, String(value));
				}
			}
		}

		const headers = { authorization: `Bearer ${token}` };
		let body;
		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
			body = JSON.stringify(options.body);
		}

		const res = await fetch(url, { method, headers, body });
		const text = await res.text();
		let parsed = null;
		try {
			parsed = text ? JSON.parse(text) : null;
		} catch (_) {
			parsed = text;
		}

		if (!res.ok) {
			const message =
				parsed && typeof parsed === "object" && parsed.error
					? String(parsed.error.message || `HTTP ${res.status}`)
					: `HTTP ${res.status}`;
			throw new NpmApiError(`NPM API error: ${message}`, res.status, parsed);
		}
		return parsed;
	};

	return { request, scopes };
};

export { createApiContext, NpmApiError };
