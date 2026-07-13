import errs from "../lib/error.js";

const PANEL_RESERVED = new Set([80, 81, 443]);

/**
 * Returns true when candidate and existing stream share at least one protocol.
 */
function protocolsOverlap(candidate, other) {
	if (candidate.tcp_forwarding && other.tcp_forwarding) return true;
	if (candidate.udp_forwarding && other.udp_forwarding) return true;
	return false;
}

/**
 * Returns true when candidate and existing stream share the same node scope.
 * Scope is "all nodes", a specific node_id, or local/null (node_id absent/null and node_all false).
 */
function nodesOverlap(candidate, other) {
	if (candidate.node_all || other.node_all) return true;
	const cNode = candidate.node_id ?? null;
	const oNode = other.node_id ?? null;
	return cNode === oNode;
}

/**
 * Validate that the candidate stream's incoming_port does not conflict with
 * existing streams or panel-reserved ports.
 *
 * @param {{ id?: number, incoming_port: number, tcp_forwarding?: boolean, udp_forwarding?: boolean, node_id?: number|null, node_all?: boolean }} candidate
 * @param {Array<{ id: number, incoming_port: number, tcp_forwarding: boolean, udp_forwarding: boolean, node_id: number|null, node_all: boolean, enabled: boolean, is_deleted: boolean }>} existingStreams
 */
export function assertPortAvailable(candidate, existingStreams) {
	const port = Number(candidate.incoming_port);

	// Panel-reserved ports only blocked for local-scope streams
	if (PANEL_RESERVED.has(port) && !candidate.node_all && !candidate.node_id) {
		throw new errs.ValidationError(`Port ${port} is reserved by the NPM panel and cannot be used for local-scope streams`);
	}

	for (const other of existingStreams) {
		// Skip self (update case)
		if (candidate.id !== undefined && candidate.id !== null && other.id === candidate.id) continue;
		// Skip disabled or deleted
		if (!other.enabled || other.is_deleted) continue;
		// Skip different ports
		if (other.incoming_port !== port) continue;
		// Check overlapping protocol and node scope
		if (protocolsOverlap(candidate, other) && nodesOverlap(candidate, other)) {
			throw new errs.ValidationError(`incoming_port ${port} is already in use by stream id ${other.id}`);
		}
	}
}

export default { assertPortAvailable };
