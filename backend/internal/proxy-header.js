import errs from "../lib/error.js";

const BLOCKED_NAMES = new Set(["host", "x-forwarded-for", "x-forwarded-proto"]);
const NAME_RE = /^[A-Za-z0-9-]+$/;

/**
 * Validate a headers array before persisting to DB.
 * Throws ValidationError (400) on any violation.
 *
 * @param {Array|null|undefined} headers
 */
export function validate(headers) {
	if (headers === null || headers === undefined) return;
	if (!Array.isArray(headers)) {
		throw new errs.ValidationError("headers must be an array");
	}

	for (const [i, h] of headers.entries()) {
		if (!h || typeof h !== "object") {
			throw new errs.ValidationError(`headers[${i}]: must be an object`);
		}
		if (h.direction !== "request" && h.direction !== "response") {
			throw new errs.ValidationError(`headers[${i}].direction must be "request" or "response"`);
		}
		if (h.action !== "set" && h.action !== "remove") {
			throw new errs.ValidationError(`headers[${i}].action must be "set" or "remove"`);
		}
		if (!h.name || !NAME_RE.test(h.name)) {
			throw new errs.ValidationError(`headers[${i}].name must match ^[A-Za-z0-9-]+$ and be non-empty`);
		}
		if (BLOCKED_NAMES.has(h.name.toLowerCase())) {
			throw new errs.ValidationError(
				`headers[${i}].name "${h.name}" is managed by NPM — use the SSL settings or trust-forwarded-proto toggle instead`,
			);
		}
		if (h.action === "set") {
			if (typeof h.value !== "string" || h.value === "") {
				throw new errs.ValidationError(`headers[${i}].value is required when action is "set"`);
			}
			if (/["\r\n]/.test(h.value)) {
				throw new errs.ValidationError(`headers[${i}].value must not contain double-quotes or newlines`);
			}
			if (h.value.trimEnd().endsWith(";")) {
				throw new errs.ValidationError(`headers[${i}].value must not end with a semicolon`);
			}
		}
	}
}

export default { validate };
