/**
 * Tiny standard 5-field cron matcher: "minute hour day-of-month month day-of-week".
 * Supports `*`, lists (`a,b`), ranges (`a-b`), and steps (`*` + `/n`, `a-b/n`).
 * Day-of-week is 0-6 with Sunday = 0 (7 also accepted as Sunday).
 *
 * Only matching is implemented — the scheduler ticks every minute and asks
 * whether the current wall-clock minute matches the expression.
 */

const FIELD_BOUNDS = [
	[0, 59], // minute
	[0, 23], // hour
	[1, 31], // day of month
	[1, 12], // month
	[0, 6], // day of week
];

/**
 * Expand one cron field into a Set of allowed integers.
 * @param {string} field
 * @param {number} min
 * @param {number} max
 * @returns {Set<number>}
 */
const parseField = (field, min, max) => {
	const allowed = new Set();
	for (const part of field.split(",")) {
		const [rangePart, stepPart] = part.split("/");
		const step = stepPart ? Number.parseInt(stepPart, 10) : 1;
		if (!Number.isInteger(step) || step < 1) {
			throw new Error(`Invalid cron step in "${part}"`);
		}
		let lo;
		let hi;
		if (rangePart === "*" || rangePart === "") {
			lo = min;
			hi = max;
		} else if (rangePart.includes("-")) {
			const [a, b] = rangePart.split("-").map((n) => Number.parseInt(n, 10));
			lo = a;
			hi = b;
		} else {
			lo = Number.parseInt(rangePart, 10);
			hi = lo;
		}
		if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
			throw new Error(`Invalid cron field "${part}" (bounds ${min}-${max})`);
		}
		for (let v = lo; v <= hi; v += step) {
			allowed.add(v);
		}
	}
	return allowed;
};

/**
 * Parse a 5-field cron expression into an array of Sets.
 * @param {string} expr
 * @returns {Array<Set<number>>}
 */
export const parse = (expr) => {
	const fields = String(expr).trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new Error(`Cron expression must have 5 fields, got ${fields.length}`);
	}
	return fields.map((f, i) => parseField(f, FIELD_BOUNDS[i][0], FIELD_BOUNDS[i][1]));
};

/**
 * Whether `date` (local time) matches the cron expression.
 * @param {string} expr
 * @param {Date} [date]
 * @returns {boolean}
 */
export const matches = (expr, date = new Date()) => {
	const [min, hour, dom, mon, dow] = parse(expr);
	const wd = date.getDay(); // 0-6, Sun=0
	// Standard cron: when both DOM and DOW are restricted, either matching is enough.
	const domRestricted = dom.size !== 31;
	const dowRestricted = dow.size !== 7;
	const dayOk =
		domRestricted && dowRestricted
			? dom.has(date.getDate()) || dow.has(wd)
			: dom.has(date.getDate()) && dow.has(wd);
	return min.has(date.getMinutes()) && hour.has(date.getHours()) && dayOk && mon.has(date.getMonth() + 1);
};

export default { parse, matches };
