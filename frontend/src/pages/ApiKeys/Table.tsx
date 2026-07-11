import { IconDotsVertical, IconRefresh, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { ApiKey } from "src/api/backend";
import { DateFormatter, EmptyData, ValueWithDateFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";

interface Props {
	data: ApiKey[];
	isFetching?: boolean;
	onReroll?: (id: number, name: string) => void;
	onRevoke?: (id: number) => void;
	onNew?: () => void;
}
export default function Table({ data, isFetching, onReroll, onRevoke, onNew }: Props) {
	const columnHelper = createColumnHelper<ApiKey>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row, {
				id: "name",
				header: intl.formatMessage({ id: "column.name" }),
				cell: (info: any) => {
					const value = info.getValue();
					return <ValueWithDateFormatter value={value.name} createdOn={value.createdOn} />;
				},
			}),
			columnHelper.accessor((row: any) => row.scopes, {
				id: "scopes",
				header: intl.formatMessage({ id: "apikey.scopes" }),
				cell: (info: any) => {
					const value = info.getValue();
					if (!value?.length) {
						return (
							<span className="badge bg-cyan-lt">
								<T id="apikey.full-access" />
							</span>
						);
					}
					return (
						<>
							{value.map((scope: string) => (
								<span className="badge bg-secondary-lt me-1" key={scope}>
									{scope}
								</span>
							))}
						</>
					);
				},
			}),
			columnHelper.accessor((row: any) => row.lastUsedOn, {
				id: "lastUsedOn",
				header: intl.formatMessage({ id: "column.last-used" }),
				cell: (info: any) => {
					const value = info.getValue();
					if (!value) {
						return (
							<span className="text-secondary">
								<T id="apikey.never-used" />
							</span>
						);
					}
					return <DateFormatter value={value} />;
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
										tData={{ object: "api-key" }}
										data={{ id: info.row.original.id }}
									/>
								</span>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onReroll?.(info.row.original.id, info.row.original.name);
									}}
								>
									<IconRefresh size={16} />
									<T id="apikey.reroll" />
								</a>
								<div className="dropdown-divider" />
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onRevoke?.(info.row.original.id);
									}}
								>
									<IconTrash size={16} />
									<T id="apikey.revoke" />
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
		[columnHelper, onReroll, onRevoke],
	);

	const tableInstance = useReactTable<ApiKey>({
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
				<EmptyData
					object="api-key"
					objects="api-keys"
					tableInstance={tableInstance}
					onNew={onNew}
					color="cyan"
				/>
			}
		/>
	);
}
