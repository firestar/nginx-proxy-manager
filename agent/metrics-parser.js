// Same log_format parser as backend/internal/metrics-parser.js — kept in sync manually.
const LOG_REGEX =
	/^\[([^\]]+)\] (\S+) \S+(?:, \S+)* (\d{3}) - \S+ \S+ \S+ "(?:[^"\\]|\\.)*" \[Client [^\]]*\] \[Length (\d+)\] \[Gzip [^\]]*\] \[Sent-to [^\]]*\] "(?:[^"\\]|\\.)*" "(?:[^"\\]|\\.)*"$/;

const MONTH_MAP = {
	Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
	Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

export const parseLogLine = (line) => {
	const m = LOG_REGEX.exec(line);
	if (!m) return null;

	const [, timeLocal, cacheStatus, statusStr, bytesStr] = m;

	const timeParts =
		/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/.exec(timeLocal);
	if (!timeParts) return null;

	const [, day, mon, year, hour, minute, , tz] = timeParts;
	const monthNum = MONTH_MAP[mon];
	if (!monthNum) return null;

	const tzMinutes = (tz[0] === "-" ? -1 : 1) * (Number.parseInt(tz.slice(1, 3), 10) * 60 + Number.parseInt(tz.slice(3, 5), 10));
	const utcMs =
		Date.UTC(Number(year), Number(monthNum) - 1, Number(day), Number(hour), Number(minute)) - tzMinutes * 60 * 1000;
	const bucket = new Date(utcMs).toISOString().replace("T", " ").slice(0, 19);
	const status = Number.parseInt(statusStr, 10);
	const bytes = Number.parseInt(bytesStr, 10);
	const cacheHit = cacheStatus === "HIT";

	return { bucket, status, bytes, cacheHit };
};
