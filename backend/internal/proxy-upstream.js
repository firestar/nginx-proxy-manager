import errs from "../lib/error.js";

// hostname or IP (v4/v6 without brackets); mirrors what nginx accepts in an upstream server directive
const HOST_RE = /^[A-Za-z0-9._:-]+$/;
const BALANCE_METHODS = new Set(["least_conn", "ip_hash"]);

/**
 * Validate an upstreams array (Phase A load balancing) before persisting to DB.
 *
 * null/undefined upstreams => single-target mode (forward_host/forward_port); nothing to validate.
 * Throws ValidationError (400) on any violation.
 *
 * @param {Array|null|undefined}  upstreams
 * @param {String|null|undefined} balanceMethod
 */
export function validate(upstreams, balanceMethod) {
	if (upstreams === null || upstreams === undefined) return;

	if (balanceMethod !== null && balanceMethod !== undefined && !BALANCE_METHODS.has(balanceMethod)) {
		throw new errs.ValidationError('balance_method must be "least_conn", "ip_hash" or null');
	}

	if (!Array.isArray(upstreams)) {
		throw new errs.ValidationError("upstreams must be an array");
	}
	if (upstreams.length < 1) {
		throw new errs.ValidationError("upstreams must contain at least one entry");
	}

	const seen = new Set();
	let nonBackup = 0;

	for (const [i, u] of upstreams.entries()) {
		if (!u || typeof u !== "object") {
			throw new errs.ValidationError(`upstreams[${i}]: must be an object`);
		}
		if (typeof u.host !== "string" || !HOST_RE.test(u.host)) {
			throw new errs.ValidationError(`upstreams[${i}].host must be a valid host or IP`);
		}
		if (!Number.isInteger(u.port) || u.port < 1 || u.port > 65535) {
			throw new errs.ValidationError(`upstreams[${i}].port must be an integer between 1 and 65535`);
		}
		if (u.weight !== undefined && u.weight !== null && (!Number.isInteger(u.weight) || u.weight < 1)) {
			throw new errs.ValidationError(`upstreams[${i}].weight must be an integer >= 1`);
		}
		if (u.max_fails !== undefined && u.max_fails !== null && (!Number.isInteger(u.max_fails) || u.max_fails < 0)) {
			throw new errs.ValidationError(`upstreams[${i}].max_fails must be an integer >= 0`);
		}
		if (u.fail_timeout !== undefined && u.fail_timeout !== null && (!Number.isInteger(u.fail_timeout) || u.fail_timeout < 1)) {
			throw new errs.ValidationError(`upstreams[${i}].fail_timeout must be an integer >= 1 (seconds)`);
		}

		const key = `${u.host}:${u.port}`;
		if (seen.has(key)) {
			throw new errs.ValidationError(`upstreams: duplicate host:port ${key}`);
		}
		seen.add(key);

		if (!u.backup) {
			nonBackup++;
		}
	}

	if (nonBackup < 1) {
		throw new errs.ValidationError("upstreams must contain at least one non-backup entry");
	}
}

export default { validate };
