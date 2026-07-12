// Uptime checker for proxy hosts pinned to THIS agent node.
// The panel sends checks[] in the config snapshot; the agent probes them
// and ships raw probe results to the panel which owns flap/transition logic.

const PROBE_TIMEOUT_MS = 10 * 1000;
const TICK_INTERVAL_MS = 10 * 1000;

// Per-host last-checked timestamp in ms
const lastChecked = new Map();

// Checks received from the last config snapshot: [{id, forward_scheme, forward_host, forward_port, check_path, check_interval_s, expected_status, domain_names}]
let currentChecks = [];

/**
 * Update the list of hosts to probe.
 * Called when a new config snapshot arrives.
 *
 * @param {Array} checks
 */
const updateChecks = (checks) => {
	currentChecks = Array.isArray(checks) ? checks : [];
};

const probe = async (check) => {
	const url = `${check.forward_scheme}://${check.forward_host}:${check.forward_port}${check.check_path || "/"}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	const t0 = Date.now();
	try {
		const fetchOpts = {
			method: "HEAD",
			headers: { Host: Array.isArray(check.domain_names) && check.domain_names[0] ? check.domain_names[0] : check.forward_host },
			signal: controller.signal,
			redirect: "follow",
		};
		if (check.forward_scheme === "https") {
			const { Agent } = await import("undici");
			fetchOpts.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
		}
		const res = await fetch(url, fetchOpts);
		const latencyMs = Date.now() - t0;
		const expectedStr = check.expected_status || "200-399";
		const ok = parseExpectedStatus(expectedStr)(res.status);
		return { ok, status: res.status, latencyMs, error: null };
	} catch (err) {
		const latencyMs = Date.now() - t0;
		return { ok: false, status: null, latencyMs, error: err.message };
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Parse "200-399" or "200,201,204" expected_status string into a predicate.
 */
const parseExpectedStatus = (str) => {
	const parts = String(str || "200-399").split(",").map((p) => p.trim());
	const predicates = parts.map((p) => {
		const range = /^(\d+)-(\d+)$/.exec(p);
		if (range) {
			const lo = Number(range[1]), hi = Number(range[2]);
			return (s) => s >= lo && s <= hi;
		}
		const exact = Number(p);
		return (s) => s === exact;
	});
	return (status) => predicates.some((fn) => fn(status));
};

/**
 * Initialise the uptime tick timer on the agent.
 *
 * @param {Function} send  function that sends a WS message; returns true if sent
 * @returns {NodeJS.Timer}
 */
const initTimer = (send) => {
	const tick = async () => {
		const now = Date.now();
		for (const check of currentChecks) {
			const intervalMs = (check.check_interval_s || 60) * 1000;
			const last = lastChecked.get(check.id) || 0;
			if (now - last < intervalMs) continue;
			lastChecked.set(check.id, now);

			try {
				const result = await probe(check);
				send({
					type: "uptime",
					hostId: check.id,
					ok: result.ok,
					status: result.status,
					latencyMs: result.latencyMs,
					error: result.error,
				});
			} catch {
				// probe threw unexpectedly — skip this cycle
			}
		}
	};

	tick();
	return setInterval(tick, TICK_INTERVAL_MS);
};

export { initTimer, updateChecks };
