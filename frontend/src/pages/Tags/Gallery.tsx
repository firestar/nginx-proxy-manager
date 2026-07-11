import { IconDotsVertical, IconEdit, IconTrash } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import type { Tag } from "src/api/backend";
import { Button, HasPermission, TagChip } from "src/components";
import { T } from "src/locale";
import { MANAGE } from "src/modules/Permissions";

export interface TagUsage {
	proxy: number;
	redirection: number;
	dead: number;
	stream: number;
}

const USAGE_LINKS: { key: keyof TagUsage; labelId: string; to: string }[] = [
	{ key: "proxy", labelId: "proxy-hosts.count", to: "/nginx/proxy" },
	{ key: "redirection", labelId: "redirection-hosts.count", to: "/nginx/redirection" },
	{ key: "dead", labelId: "dead-hosts.count", to: "/nginx/404" },
	{ key: "stream", labelId: "streams.count", to: "/nginx/stream" },
];

interface Props {
	data: Tag[];
	usage: Record<number, TagUsage>;
	isFiltered?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onNew?: () => void;
}
export default function Gallery({ data, usage, isFiltered, onEdit, onDelete, onNew }: Props) {
	const navigate = useNavigate();

	if (!data.length) {
		return (
			<div className="text-center my-5 py-4">
				{isFiltered ? (
					<h2>
						<T id="empty-search" />
					</h2>
				) : (
					<>
						<h2>
							<T id="object.empty" tData={{ objects: "tags" }} />
						</h2>
						<HasPermission permission={MANAGE} hideError>
							<p className="text-muted">
								<T id="empty-subtitle" />
							</p>
							<Button className="my-3 btn-purple" onClick={onNew}>
								<T id="object.add" tData={{ object: "tag" }} />
							</Button>
						</HasPermission>
					</>
				)}
			</div>
		);
	}

	return (
		<div className="row row-cards p-3">
			{data.map((tag) => {
				const u = usage[tag.id || 0];
				const total = u ? u.proxy + u.redirection + u.dead + u.stream : 0;
				return (
					<div key={tag.id} className="col-sm-6 col-lg-4 col-xl-3">
						<div className="card">
							<div className="card-body">
								<div className="d-flex align-items-center mb-3">
									<TagChip tag={tag} className="fs-5 px-2 py-1" />
									<span className="dropdown ms-auto">
										<button
											type="button"
											className="btn dropdown-toggle btn-action btn-sm px-1"
											data-bs-boundary="viewport"
											data-bs-toggle="dropdown"
										>
											<IconDotsVertical />
										</button>
										<div className="dropdown-menu dropdown-menu-end">
											<a
												className="dropdown-item"
												href="#"
												onClick={(e) => {
													e.preventDefault();
													onEdit?.(tag.id || 0);
												}}
											>
												<IconEdit size={16} />
												<T id="action.edit" />
											</a>
											<div className="dropdown-divider" />
											<a
												className="dropdown-item"
												href="#"
												onClick={(e) => {
													e.preventDefault();
													onDelete?.(tag.id || 0);
												}}
											>
												<IconTrash size={16} />
												<T id="action.delete" />
											</a>
										</div>
									</span>
								</div>
								{total === 0 ? (
									<div className="text-muted small">
										<T id="tags.unused" />
									</div>
								) : (
									<div className="d-flex flex-column gap-1">
										{USAGE_LINKS.map(({ key, labelId, to }) => {
											const count = u?.[key] || 0;
											if (!count) {
												return null;
											}
											return (
												<button
													key={key}
													type="button"
													className="btn btn-link btn-sm p-0 text-start"
													onClick={() => navigate(`${to}?tags=${tag.id}`)}
												>
													<T id={labelId} data={{ count }} />
												</button>
											);
										})}
									</div>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
