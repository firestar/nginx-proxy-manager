// Tail nginx access logs on the agent node and ship minute-bucket aggregates
// to the panel over the WS channel.  Mirrors backend/internal/metrics.js but
// runs locally on the agent and ships results rather than writing to a DB.

import fs from "node:fs";
import path from "node:path";
import { parseLogLine } from "./metrics-parser.js";

const LOG_DIR = "/data/logs";
const MAX_READ_BYTES = 16 * 1024 * 1024;
const COLLECT_INTERVAL_MS = 30 * 1000;

// Minute-truncate a "YYYY-MM-DD HH:MM:SS" string
const minuteBucket = (dt) => `${dt.slice(0, 16)}:00`;

/**
 * Scan LOG_DIR for proxy-host-{id}_access.log files.
 * Returns [{id, logPath}].
 */
const discoverLogs = () => {
	let names;
	try {
		names = fs.readdirSync(LOG_DIR);
	} catch {
		return [];
	}
	const out = [];
	for (const name of names) {
		const m = /^proxy-host-(\d+)_access\.log$/.exec(name);
		if (m) {
			out.push({ id: Number(m[1]), logPath: path.join(LOG_DIR, name) });
		}
	}
	return out;
};

/**
 * Load metric state from the state file.
 * Returns Map<hostId, {file_offset, file_size}>.
 */
const loadState = (stateFile) => {
	try {
		const raw = JSON.parse(fs.readFileSync(stateFile, "utf8"));
		return new Map(Object.entries(raw).map(([k, v]) => [Number(k), v]));
	} catch {
		return new Map();
	}
};

const saveState = (stateFile, stateMap) => {
	const obj = {};
	for (const [k, v] of stateMap) {
		obj[k] = v;
	}
	try {
		fs.writeFileSync(stateFile, JSON.stringify(obj), "utf8");
	} catch {
		// best-effort
	}
};

/**
 * Read new log bytes for one host, aggregate into minute buckets.
 * Returns array of bucket objects or [] if nothing new.
 */
const processLog = (hostId, logPath, stateMap) => {
	let stat;
	try {
		stat = fs.statSync(logPath);
	} catch {
		return [];
	}

	const prevState = stateMap.get(hostId) || { file_offset: 0, file_size: 0 };
	let offset = Number(prevState.file_offset);
	const prevSize = Number(prevState.file_size);
	const currentSize = Number(stat.size);

	// Rotation/truncation
	if (currentSize < prevSize || currentSize < offset) {
		offset = 0;
	}

	if (currentSize <= offset) {
		return [];
	}

	const readLength = Math.min(currentSize - offset, MAX_READ_BYTES);
	const buf = Buffer.alloc(readLength);
	const fd = fs.openSync(logPath, "r");
	let bytesRead = 0;
	try {
		bytesRead = fs.readSync(fd, buf, 0, readLength, offset);
	} finally {
		fs.closeSync(fd);
	}

	const chunk = buf.subarray(0, bytesRead).toString("utf8");
	const lastNewline = chunk.lastIndexOf("\n");
	const toProcess = lastNewline >= 0 ? chunk.slice(0, lastNewline) : "";
	const newOffset = lastNewline >= 0 ? offset + Buffer.byteLength(chunk.slice(0, lastNewline + 1)) : offset;

	const buckets = new Map();
	for (const line of toProcess.split("\n")) {
		if (!line) continue;
		const parsed = parseLogLine(line);
		if (!parsed) continue;

		const key = minuteBucket(parsed.bucket);
		if (!buckets.has(key)) {
			buckets.set(key, { requests: 0, bytes_sent: 0, status_2xx: 0, status_3xx: 0, status_4xx: 0, status_5xx: 0, cache_hits: 0 });
		}
		const b = buckets.get(key);
		b.requests += 1;
		b.bytes_sent += parsed.bytes;
		if (parsed.cacheHit) b.cache_hits += 1;
		const s = parsed.status;
		if (s >= 200 && s < 300) b.status_2xx += 1;
		else if (s >= 300 && s < 400) b.status_3xx += 1;
		else if (s >= 400 && s < 500) b.status_4xx += 1;
		else if (s >= 500) b.status_5xx += 1;
	}

	if (buckets.size > 0 || newOffset !== offset) {
		stateMap.set(hostId, { file_offset: newOffset, file_size: currentSize });
	}

	return [...buckets.entries()].map(([bucket, counts]) => ({
		proxyHostId: hostId,
		bucket,
		resolution: "minute",
		...counts,
	}));
};

/**
 * Initialise the metrics collection timer on the agent.
 *
 * @param {string}   dataDir   agent data dir (default /data/agent)
 * @param {Function} send      function that sends a WS message; returns true if sent
 */
const initTimer = (dataDir, send) => {
	const stateFile = path.join(dataDir, "metric-state.json");
	const stateMap = loadState(stateFile);

	const collect = () => {
		const logs = discoverLogs();
		const allBuckets = [];
		for (const { id, logPath } of logs) {
			const buckets = processLog(id, logPath, stateMap);
			allBuckets.push(...buckets);
		}

		if (allBuckets.length > 0) {
			const sent = send({ type: "metrics", buckets: allBuckets });
			if (sent) {
				saveState(stateFile, stateMap);
			}
			// If not sent (disconnected), stateMap already has the new offsets — they
			// were written above. We don't advance the state file on disk so on
			// reconnect we re-read from the same offsets and re-ship.
			// Revert in-memory state to where it was before this collect so we
			// don't lose data while disconnected.
			if (!sent) {
				// Re-load from file — which still has the pre-collect offsets
				const saved = loadState(stateFile);
				for (const [id, s] of saved) {
					stateMap.set(id, s);
				}
			}
		} else {
			// Nothing new; still persist state (file_size may have changed)
			saveState(stateFile, stateMap);
		}
	};

	collect();
	return setInterval(collect, COLLECT_INTERVAL_MS);
};

export { initTimer, processLog, loadState, saveState };
