import { getConfig } from "./config.js";

export class NpmApiError extends Error {
	status: number;
	body: unknown;

	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = "NpmApiError";
		this.status = status;
		this.body = body;
	}
}

interface CachedToken {
	token: string;
	/** Epoch millis at which the token expires. */
	expires: number;
}

let cachedToken: CachedToken | null = null;

/** Refresh the token when it's within this many ms of expiring. */
const EXPIRY_SKEW_MS = 60_000;

async function parseBody(res: Response): Promise<unknown> {
	const text = await res.text();
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function login(): Promise<CachedToken> {
	const { baseUrl, identity, secret } = getConfig();
	if (!identity || !secret) {
		throw new Error("NPM_IDENTITY and NPM_SECRET must be set when NPM_API_KEY is not configured.");
	}
	const res = await fetch(`${baseUrl}/tokens`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ identity, secret }),
	});
	const body = (await parseBody(res)) as Record<string, unknown> | null;
	if (!res.ok) {
		throw new NpmApiError(`NPM login failed (HTTP ${res.status})`, res.status, body);
	}
	// A successful credential login returns { token, expires }. If NPM instead
	// returns a 2FA challenge there is no token — credential auth can't proceed.
	if (!body || typeof body.token !== "string") {
		throw new NpmApiError(
			"NPM login did not return a token. If this account has two-factor auth enabled, " +
				"credential-based auth is not supported — use a dedicated NPM user without 2FA.",
			res.status,
			body,
		);
	}
	const expiresRaw = typeof body.expires === "string" ? Date.parse(body.expires) : Number.NaN;
	return {
		token: body.token,
		// Fall back to a conservative 55-minute lifetime if the field is unparseable.
		expires: Number.isNaN(expiresRaw) ? Date.now() + 55 * 60_000 : expiresRaw,
	};
}

async function getToken(forceRefresh = false): Promise<string> {
	// API keys are long-lived bearer values — no login or refresh cycle.
	const { apiKey } = getConfig();
	if (apiKey) {
		return apiKey;
	}
	if (!forceRefresh && cachedToken && cachedToken.expires - Date.now() > EXPIRY_SKEW_MS) {
		return cachedToken.token;
	}
	cachedToken = await login();
	return cachedToken.token;
}

export interface NpmRequestOptions {
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: NpmRequestOptions["query"]): string {
	const { baseUrl } = getConfig();
	const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url.toString();
}

async function doRequest(
	method: string,
	path: string,
	options: NpmRequestOptions,
	token: string,
): Promise<Response> {
	const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
	let bodyInit: string | undefined;
	if (options.body !== undefined) {
		headers["Content-Type"] = "application/json";
		bodyInit = JSON.stringify(options.body);
	}
	return fetch(buildUrl(path, options.query), { method, headers, body: bodyInit });
}

/**
 * Make an authenticated request against the NPM API. Automatically logs in,
 * caches the JWT, and retries once (with a fresh login) on a 401.
 */
export async function npmRequest(
	method: string,
	path: string,
	options: NpmRequestOptions = {},
): Promise<unknown> {
	let token = await getToken();
	let res = await doRequest(method, path, options, token);

	if (res.status === 401) {
		const { apiKey } = getConfig();
		if (apiKey) {
			// A rejected key won't recover by retrying.
			throw new NpmApiError(
				"NPM rejected the API key (HTTP 401). It may have been revoked or rerolled.",
				res.status,
				await parseBody(res),
			);
		}
		// Token may have been revoked/expired early — force a fresh login and retry once.
		token = await getToken(true);
		res = await doRequest(method, path, options, token);
	}
	const body = await parseBody(res);
	if (!res.ok) {
		const message =
			body && typeof body === "object" && "error" in body
				? // NPM error shape: { error: { code, message } }
					String((body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
				: `HTTP ${res.status}`;
		throw new NpmApiError(`NPM API error: ${message}`, res.status, body);
	}
	return body;
}

/** Verify credentials are valid by attempting a login. Throws on failure. */
export async function verifyConnection(): Promise<void> {
	if (getConfig().apiKey) {
		// No login step with an API key — probe an authenticated endpoint instead.
		await npmRequest("GET", "/users/me");
		return;
	}
	await getToken(true);
}
