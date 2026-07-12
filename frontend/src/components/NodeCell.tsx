import { useNodes } from "src/hooks";
import { T } from "src/locale";

interface NodeStatusEntry {
	ok?: boolean | null;
	error?: string | null;
	version?: number | null;
}

/**
 * Table badge showing which node(s) serve a host:
 *  - "Local" when nodeId is null and not replicated,
 *  - the node's name (colored by status) for a single-pinned host,
 *  - "All nodes (HA)" plus a per-node apply-state chip for a replicated host.
 */
export function NodeCell({
	nodeId,
	nodeAll,
	nodeStatus,
}: {
	nodeId?: number | null;
	nodeAll?: boolean;
	nodeStatus?: Record<string, NodeStatusEntry> | null;
}) {
	const { data: nodes } = useNodes();

	if (nodeAll) {
		const entries = Object.entries(nodeStatus || {});
		return (
			<span className="d-inline-flex align-items-center flex-wrap gap-1">
				<span className="badge bg-azure-lt">
					<T id="node.all" />
				</span>
				{entries.map(([id, st]) => {
					const node = nodes?.find((n) => String(n.id) === id);
					const color = st?.ok === false ? "bg-danger-lt" : st?.ok === true ? "bg-success-lt" : "bg-secondary-lt";
					return (
						<span key={id} className={`badge ${color}`} title={st?.error || undefined}>
							{node?.name || `#${id}`}
						</span>
					);
				})}
			</span>
		);
	}

	if (!nodeId) {
		return (
			<span className="badge bg-secondary-lt">
				<T id="node.local" />
			</span>
		);
	}

	const node = nodes?.find((n) => n.id === nodeId);
	if (!node) {
		return <span className="badge bg-secondary-lt">#{nodeId}</span>;
	}

	const color =
		node.status === "online" ? "bg-success-lt" : node.status === "offline" ? "bg-danger-lt" : "bg-secondary-lt";
	return <span className={`badge ${color}`}>{node.name}</span>;
}
