/**
 * Pure helper functions for uptime calculation — no DB or side-effects.
 * Exported here so they can be tested without triggering db/config init.
 */

/**
 * Parse an expected-status expression into a predicate.
 * Supports: ranges "200-399", comma-lists "200,301,404", single "200".
 */
const parseExpectedStatus = (expr) => {
	const parts = String(expr).split(",").map((s) => s.trim());
	const predicates = parts.map((part) => {
		const m = part.match(/^(\d+)-(\d+)$/);
		if (m) {
			const lo = Number.parseInt(m[1], 10);
			const hi = Number.parseInt(m[2], 10);
			return (code) => code >= lo && code <= hi;
		}
		const code = Number.parseInt(part, 10);
		return (c) => c === code;
	});
	return (code) => predicates.some((p) => p(code));
};

const toMs = (dt) => (dt instanceof Date ? dt.getTime() : Date.parse(String(dt).replace(" ", "T") + "Z"));

/**
 * Sum downtime milliseconds inside [windowStartMs, nowMs].
 * Open events (ended_on = null) are treated as ending at nowMs.
 */
const computeDowntimeMs = (downEvents, windowStartMs, nowMs) => {
	let total = 0;
	for (const ev of downEvents) {
		const start = toMs(ev.started_on);
		const end = ev.ended_on ? toMs(ev.ended_on) : nowMs;
		const lo = Math.max(start, windowStartMs);
		const hi = Math.min(end, nowMs);
		if (hi > lo) total += hi - lo;
	}
	return total;
};

const uptimePercent = (downEvents, windowStartMs, nowMs) => {
	const windowMs = nowMs - windowStartMs;
	if (windowMs <= 0) return 100;
	const down = computeDowntimeMs(downEvents, windowStartMs, nowMs);
	return Math.max(0, ((windowMs - down) / windowMs) * 100);
};

export { parseExpectedStatus, computeDowntimeMs, uptimePercent, toMs };
