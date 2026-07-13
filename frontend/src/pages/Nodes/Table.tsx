import { Link } from "react-router-dom";
import { IconDotsVertical, IconEdit, IconRefresh, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { NPMNode } from "src/api/backend";
import { DateFormatter, EmptyData, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { useNodesMetrics } from "src/hooks";
import { intl, T } from "src/locale";

const statusBadge = (node: NPMNode) => {
	if (node.status === "online") {
		return (
			<span className="badge bg-success-lt">
				<T id="node.status.online" />
			</span>
		);
	}
	if (node.status === "offline") {
		return (
			<span className="badge bg-danger-lt">
				<T id="node.status.offline" />
			</span>
		);
	}
	return (
		<span className="badge bg-secondary-lt">
			<T id="node.status.pending" />
		</span>
	);
};

interface Props {
	data: NPMNode[];
	isFetching?: boolean;
	onEdit?: (id: number, name: string) => void;
	onRegenerateToken?: (id: number, name: string) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}

export default function Table({ data, isFetching, onEdit, onRegenerateToken, onDelete, onNew }: Props) {
	const columnHelper = createColumnHelper<NPMNode>();
	const { data: nodesMetrics } = useNodesMetrics();
	const metricsMap = useMemo(() => {
		const m = new Map<number, { requestsLast15m: number; lastMetricBucket: string | null }>();
		for (const nm of nodesMetrics || []) {
			if (nm.nodeId !== null) m.set(nm.nodeId, nm);
		}
		return m;
	}, [nodesMetrics]);

	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => {
					const value = info.getValue();
					return (
						<Link to={`/nodes/${value.id}`} className="text-reset">
							<ValueWithDateFormatter value={value.name} createdOn={value.createdOn} />
						</Link>
					);
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "status",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => statusBadge(info.getValue()),
			}),
			columnHelper.accessor((row: any) => row.lastSeen, {
				id: "lastSeen",
				header: intl.formatMessage({ id: "node.last-seen" }),
				cell: (info: any) => {
					const value = info.getValue();
					if (!value) {
						return (
							<span className="text-secondary">
								<T id="node.never-seen" />
							</span>
						);
					}
					return <DateFormatter value={value} />;
				},
			}),
			columnHelper.accessor((row: any) => row.version, {
				id: "version",
				header: intl.formatMessage({ id: "node.agent-version" }),
				cell: (info: any) => <span className="font-monospace">{info.getValue() || "—"}</span>,
			}),
			columnHelper.accessor((row: any) => row.configVersion, {
				id: "configVersion",
				header: intl.formatMessage({ id: "node.config-version" }),
				cell: (info: any) => <span className="font-monospace">v{info.getValue() || 0}</span>,
			}),
			columnHelper.accessor((row: any) => row.id, {
				id: "reqRate",
				header: intl.formatMessage({ id: "node.req-rate" }),
				cell: (info: any) => {
					const nm = metricsMap.get(info.getValue());
					if (!nm) return <span className="text-secondary">—</span>;
					return (
						<span>
							{nm.requestsLast15m.toLocaleString()} <span className="text-secondary text-muted small">/ 15m</span>
						</span>
					);
				},
			}),
			columnHelper.accessor((row: any) => row.id, {
				id: "lastMetric",
				header: intl.formatMessage({ id: "node.last-metric" }),
				cell: (info: any) => {
					const nm = metricsMap.get(info.getValue());
					if (!nm?.lastMetricBucket) return <span className="text-secondary">—</span>;
					return <DateFormatter value={nm.lastMetricBucket} />;
				},
			}),
			columnHelper.display({
				id: "id",
				cell: (info: any) => {
					return (
						<span className="dropdown">
							<button
								type="button"
								className="btn dropdown-toggle btn-action btn-sm px-1"
								data-bs-boundary="viewport"
								data-bs-toggle="dropdown"
							>
								<IconDotsVertical />
							</button>
							<div className="dropdown-menu dropdown-menu-end">
								<span className="dropdown-header">
									<T id="object.actions-title" tData={{ object: "node" }} data={{ id: info.row.original.id }} />
								</span>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onEdit?.(info.row.original.id, info.row.original.name);
									}}
								>
									<IconEdit size={16} />
									<T id="object.edit" tData={{ object: "node" }} />
								</a>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onRegenerateToken?.(info.row.original.id, info.row.original.name);
									}}
								>
									<IconRefresh size={16} />
									<T id="node.regenerate-token" />
								</a>
								<div className="dropdown-divider" />
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onDelete?.(info.row.original.id);
									}}
								>
									<IconTrash size={16} />
									<T id="object.delete" tData={{ object: "node" }} />
								</a>
							</div>
						</span>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, metricsMap, onEdit, onRegenerateToken, onDelete],
	);

	const tableInstance = useReactTable<NPMNode>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: {
			isFetching,
		},
		enableSortingRemoval: false,
	});

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData object="node" objects="nodes" tableInstance={tableInstance} onNew={onNew} color="azure" />
			}
		/>
	);
}
