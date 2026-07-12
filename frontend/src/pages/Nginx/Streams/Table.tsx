import { IconDotsVertical, IconEdit, IconPower, IconTrash } from "@tabler/icons-react";
import {
	createColumnHelper,
	getCoreRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import type { Stream, Tag } from "src/api/backend";
import {
	CertificateFormatter,
	EmptyData,
	GravatarFormatter,
	HasPermission,
	NginxOnlineFormatter,
	TagsFormatter,
	TrueFalseFormatter,
	ValueWithDateFormatter,
	NodeCell,
} from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { MANAGE, STREAMS } from "src/modules/Permissions";

interface Props {
	data: Stream[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onNew?: () => void;
	onTagClick?: (tag: Tag) => void;
	onSelectionChange?: (ids: number[]) => void;
}
export default function Table({
	data,
	isFetching,
	isFiltered,
	onEdit,
	onDelete,
	onDisableToggle,
	onNew,
	onTagClick,
	onSelectionChange,
}: Props) {
	const columnHelper = createColumnHelper<Stream>();
	const columns = useMemo(
		() => [
			columnHelper.display({
				id: "select",
				header: ({ table }: any) => (
					<input
						type="checkbox"
						className="form-check-input m-0"
						checked={table.getIsAllRowsSelected()}
						onChange={table.getToggleAllRowsSelectedHandler()}
						aria-label="Select all"
					/>
				),
				cell: ({ row }: any) => (
					<input
						type="checkbox"
						className="form-check-input m-0"
						checked={row.getIsSelected()}
						onChange={row.getToggleSelectedHandler()}
						aria-label="Select row"
					/>
				),
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: any) => row.owner, {
				id: "owner",
				enableSorting: false,
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: {
					className: "w-1",
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "incomingPort",
				header: intl.formatMessage({ id: "column.incoming-port" }),
				sortingFn: (a, b) => (a.original.incomingPort ?? 0) - (b.original.incomingPort ?? 0),
				cell: (info: any) => {
					const value = info.getValue();
					return <ValueWithDateFormatter value={value.incomingPort} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "forwardHttpCode",
				header: intl.formatMessage({ id: "column.destination" }),
				sortingFn: (a, b) => {
					const aVal = `${a.original.forwardingHost}:${a.original.forwardingPort}`;
					const bVal = `${b.original.forwardingHost}:${b.original.forwardingPort}`;
					return aVal.localeCompare(bVal);
				},
				cell: (info: any) => {
					const value = info.getValue();
					return `${value.forwardingHost}:${value.forwardingPort}`;
				},
			}),
			columnHelper.accessor((row: any) => row, {
				id: "tcpForwarding",
				enableSorting: false,
				header: intl.formatMessage({ id: "column.protocol" }),
				cell: (info: any) => {
					const value = info.getValue();
					return (
						<>
							{value.tcpForwarding ? (
								<span className="badge badge-lg domain-name">
									<T id="streams.tcp" />
								</span>
							) : null}
							{value.udpForwarding ? (
								<span className="badge badge-lg domain-name">
									<T id="streams.udp" />
								</span>
							) : null}
						</>
					);
				},
			}),
			columnHelper.accessor((row: any) => row.certificate, {
				id: "certificate",
				enableSorting: false,
				header: intl.formatMessage({ id: "column.ssl" }),
				cell: (info: any) => {
					return <CertificateFormatter certificate={info.getValue()} />;
				},
			}),
			columnHelper.accessor((row: any) => row.nodeId, {
				id: "nodeId",
				enableSorting: false,
				header: intl.formatMessage({ id: "column.node" }),
				cell: (info: any) => {
					const row = info.row.original;
					return <NodeCell nodeId={row.nodeId} nodeAll={row.nodeAll} nodeStatus={row.meta?.nodeStatus} />;
				},
			}),
			columnHelper.accessor((row: any) => row.tags, {
				id: "tags",
				enableSorting: false,
				header: intl.formatMessage({ id: "column.tags" }),
				cell: (info: any) => {
					return <TagsFormatter tags={info.getValue()} onTagClick={onTagClick} />;
				},
			}),
			columnHelper.accessor((row: any) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => {
					return <TrueFalseFormatter value={info.getValue()} trueLabel="online" falseLabel="offline" />;
				},
			}),
			columnHelper.accessor((row: any) => row.meta, {
				id: "nginx_status",
				enableSorting: false,
				header: intl.formatMessage({ id: "column.nginx-status" }),
				cell: (info: any) => {
					const meta = info.getValue() || {};
					return <NginxOnlineFormatter nginxOnline={meta.nginxOnline} nginxErr={meta.nginxErr} />;
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
									<T
										id="object.actions-title"
										tData={{ object: "stream" }}
										data={{ id: info.row.original.id }}
									/>
								</span>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onEdit?.(info.row.original.id);
									}}
								>
									<IconEdit size={16} />
									<T id="action.edit" />
								</a>
								<HasPermission section={STREAMS} permission={MANAGE} hideError>
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											onDisableToggle?.(info.row.original.id, !info.row.original.enabled);
										}}
									>
										<IconPower size={16} />
										<T id={info.row.original.enabled ? "action.disable" : "action.enable"} />
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
										<T id="action.delete" />
									</a>
								</HasPermission>
							</div>
						</span>
					);
				},
				meta: {
					className: "text-end w-1",
				},
			}),
		],
		[columnHelper, onEdit, onDisableToggle, onDelete, onTagClick],
	);

	const [sorting, setSorting] = useState<SortingState>([]);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	useEffect(() => {
		onSelectionChange?.(
			Object.keys(rowSelection)
				.map(Number)
				.filter((n) => n > 0),
		);
	}, [rowSelection, onSelectionChange]);

	const tableInstance = useReactTable<Stream>({
		columns,
		data,
		state: { sorting, rowSelection },
		onSortingChange: setSorting,
		onRowSelectionChange: setRowSelection,
		enableRowSelection: true,
		getRowId: (row: any) => `${row.id}`,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
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
				<EmptyData
					object="stream"
					objects="streams"
					tableInstance={tableInstance}
					onNew={onNew}
					isFiltered={isFiltered}
					color="blue"
					permissionSection={STREAMS}
				/>
			}
		/>
	);
}
