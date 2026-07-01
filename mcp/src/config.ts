import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env loader so the package has zero runtime deps beyond the MCP SDK,
 * express and zod. Only sets keys that aren't already present in the
 * environment, so real env vars always win over the file.
 */
function loadDotEnv(): void {
	const path = resolve(process.cwd(), ".env");
	if (!existsSync(path)) {
		return;
	}
	const content = readFileSync(path, "utf8");
	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}
		const eq = line.indexOf("=");
		if (eq === -1) {
			continue;
		}
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		// Strip matching surrounding quotes.
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

export interface Config {
	baseUrl: string;
	identity: string;
	secret: string;
	port: number;
	host: string;
	authToken: string | null;
	tlsRejectUnauthorized: boolean;
}

let cached: Config | null = null;

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export function getConfig(): Config {
	if (cached) {
		return cached;
	}
	loadDotEnv();
	// Normalise the base URL: strip a single trailing slash so path joins are clean.
	const baseUrl = required("NPM_BASE_URL").replace(/\/+$/, "");
	cached = {
		baseUrl,
		identity: required("NPM_IDENTITY"),
		secret: required("NPM_SECRET"),
		port: Number.parseInt(process.env.MCP_PORT ?? "3001", 10),
		host: process.env.MCP_HOST ?? "127.0.0.1",
		authToken: process.env.MCP_AUTH_TOKEN ? process.env.MCP_AUTH_TOKEN : null,
		tlsRejectUnauthorized: process.env.NPM_TLS_REJECT_UNAUTHORIZED !== "false",
	};
	return cached;
}
