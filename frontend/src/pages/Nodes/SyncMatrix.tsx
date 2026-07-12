import { useMemo } from "react";
import { useDeadHosts, useNodes, useProxyHosts, useRedirectionHosts, useStreams } from "src/hooks";
import { T } from "src/locale";

interface MatrixRow {
	key: string;
	label: string;
	type: string;
	nodeId?: number | null;
	nodeAll?: boolean;
	nodeStatus?: Record<string, { ok?: boolean | null; error?: string | null }> | null;
}

const hostLabel = (h: any, type: string) => {
	if (type === "stream") return `:${h.incomingPort}`;
	return (h.domainNames && h.domainNames[0]) || `#${h.id}`;
};

const stateChip = (st?: { ok?: boolean | null; error?: string | null }) => {
	const ok = st?.ok;
	const color = ok === false ? "bg-danger-lt" : ok === true ? "bg-success-lt" : "bg-secondary-lt";
	const id = ok === false ? "nginx.error" : ok === true ? "online" : "node.pending-apply";
	return (
		<span className={`badge ${color}`} title={st?.error || undefined}>
			<T id={id} />
		</span>
	);
};

/**
 * Per-host sync matrix: rows are hosts served by a remote node (single-pinned
 * or replicate-to-all), columns are the enrolled nodes, cells show the apply
 * state reported by that node's agent.
 */
export default function SyncMatrix() {
	const { data: nodes } = useNodes();
	const { data: proxy } = useProxyHosts();
	const { data: redir } = useRedirectionHosts();
	const { data: dead } = useDeadHosts();
	const { data: streams } = useStreams();

	const enrolled = (nodes || []).filter((n) => n.status !== "pending");

	const rows = useMemo<MatrixRow[]>(() => {
		const collect = (list: any[] | undefined, type: string): MatrixRow[] =>
			(list || [])
				.filter((h) => h.nodeId || h.nodeAll)
				.map((h) => ({
					key: `${type}-${h.id}`,
					label: hostLabel(h, type),
					type,
					nodeId: h.nodeId,
					nodeAll: h.nodeAll,
					nodeStatus: h.meta?.nodeStatus,
				}));
		return [
			...collect(proxy, "proxy"),
			...collect(redir, "redirection"),
			...collect(dead, "dead"),
			...collect(streams, "stream"),
		];
	}, [proxy, redir, dead, streams]);

	if (!enrolled.length || !rows.length) {
		return null;
	}

	const cell = (row: MatrixRow, nodeId: number) => {
		const st = row.nodeStatus?.[String(nodeId)];
		if (row.nodeAll || row.nodeId === nodeId) {
			return stateChip(st);
		}
		return <span className="text-secondary">·</span>;
	};

	return (
		<div className="card mt-4">
			<div className="card-header">
				<h3 className="card-title">
					<T id="node.sync-matrix" />
				</h3>
			</div>
			<div className="table-responsive">
				<table className="table card-table table-vcenter">
					<thead>
						<tr>
							<th>
								<T id="node.sync-host" />
							</th>
							{enrolled.map((n) => (
								<th key={n.id} className="text-center">
									{n.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.key}>
								<td>
									<span className="text-secondary small me-1">{r.type}</span>
									{r.label}
									{r.nodeAll ? (
										<span className="badge bg-azure-lt ms-1">
											<T id="node.all" />
										</span>
									) : null}
								</td>
								{enrolled.map((n) => (
									<td key={n.id} className="text-center">
										{cell(r, n.id)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
