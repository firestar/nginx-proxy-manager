import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import type { Tag } from "src/api/backend";
import { LoadingPage, TagChip } from "src/components";
import { useDeadHosts, useProxyHosts, useRedirectionHosts, useStreams, useTags } from "src/hooks";
import { T } from "src/locale";
import {
	showDeadHostModal,
	showProxyHostModal,
	showRedirectionHostModal,
	showStreamModal,
} from "src/modals";

type GroupHostType = "proxy" | "redirection" | "dead" | "stream";

interface GroupHost {
	type: GroupHostType;
	id: number;
	title: string;
	subtitle?: string;
	enabled?: boolean;
	tags?: Tag[];
}

const TYPE_LABEL: Record<GroupHostType, string> = {
	proxy: "proxy-host",
	redirection: "redirection-host",
	dead: "dead-host",
	stream: "stream",
};

const TYPE_COLOR: Record<GroupHostType, string> = {
	proxy: "lime",
	redirection: "yellow",
	dead: "red",
	stream: "blue",
};

const openEditModal = (host: GroupHost) => {
	switch (host.type) {
		case "proxy":
			showProxyHostModal(host.id);
			break;
		case "redirection":
			showRedirectionHostModal(host.id);
			break;
		case "dead":
			showDeadHostModal(host.id);
			break;
		case "stream":
			showStreamModal(host.id);
			break;
	}
};

function HostCard({ host }: { host: GroupHost }) {
	return (
		<div className="col-sm-6 col-lg-4 col-xl-3">
			<button
				type="button"
				className="card card-link w-100 text-start border-0 p-0"
				onClick={() => openEditModal(host)}
			>
				<div className="card-body p-3">
					<div className="d-flex align-items-center mb-1">
						<span className={`badge bg-${TYPE_COLOR[host.type]}-lt me-2`}>
							<T id={TYPE_LABEL[host.type]} />
						</span>
						{typeof host.enabled !== "undefined" ? (
							<span
								className={`status-dot ms-auto ${host.enabled ? "status-dot-animated bg-success" : "bg-danger"}`}
							/>
						) : null}
					</div>
					<div className="fw-bold text-truncate">{host.title}</div>
					{host.subtitle ? (
						<div className="text-muted small text-truncate">{host.subtitle}</div>
					) : null}
				</div>
			</button>
		</div>
	);
}

export default function TagGroups() {
	const tags = useTags(["owner"]);
	const { data: proxyHosts } = useProxyHosts(["tags"]);
	const { data: redirectionHosts } = useRedirectionHosts(["tags"]);
	const { data: deadHosts } = useDeadHosts(["tags"]);
	const { data: streams } = useStreams(["tags"]);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	if (tags.isLoading) {
		return <LoadingPage />;
	}
	if (tags.isError) {
		return <Alert variant="danger">{tags.error?.message || "Unknown error"}</Alert>;
	}

	const hosts: GroupHost[] = [
		...(proxyHosts?.map((h) => ({
			type: "proxy" as const,
			id: h.id || 0,
			title: h.domainNames?.join(", ") || `#${h.id}`,
			subtitle: `${h.forwardScheme}://${h.forwardHost}:${h.forwardPort}`,
			enabled: h.enabled,
			tags: h.tags,
		})) || []),
		...(redirectionHosts?.map((h) => ({
			type: "redirection" as const,
			id: h.id || 0,
			title: h.domainNames?.join(", ") || `#${h.id}`,
			subtitle: h.forwardDomainName,
			enabled: h.enabled,
			tags: h.tags,
		})) || []),
		...(deadHosts?.map((h) => ({
			type: "dead" as const,
			id: h.id || 0,
			title: h.domainNames?.join(", ") || `#${h.id}`,
			enabled: h.enabled,
			tags: h.tags,
		})) || []),
		...(streams?.map((h) => ({
			type: "stream" as const,
			id: h.id || 0,
			title: `${h.incomingPort}`,
			subtitle: `${h.forwardingHost}:${h.forwardingPort}`,
			enabled: h.enabled,
			tags: h.tags,
		})) || []),
	];

	const groups: { key: string; tag: Tag | null; hosts: GroupHost[] }[] = (tags.data || []).map(
		(tag) => ({
			key: `tag-${tag.id}`,
			tag,
			hosts: hosts.filter((h) => h.tags?.some((t) => t.id === tag.id)),
		}),
	);
	const untagged = hosts.filter((h) => !h.tags?.length);
	if (untagged.length) {
		groups.push({ key: "untagged", tag: null, hosts: untagged });
	}

	const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

	return (
		<div className="mt-4">
			<h2 className="page-title mb-3">
				<T id="tag-groups" />
			</h2>
			{groups.length === 0 || hosts.length === 0 ? (
				<div className="card">
					<div className="card-body text-center py-5">
						<h3>
							<T id="tag-groups.empty" />
						</h3>
					</div>
				</div>
			) : (
				groups.map(({ key, tag, hosts: groupHosts }) => {
					const isCollapsed = !!collapsed[key];
					return (
						<div key={key} className="card mb-3">
							<button
								type="button"
								className="card-header w-100 text-start border-0 bg-transparent d-flex align-items-center"
								onClick={() => toggle(key)}
							>
								{isCollapsed ? <IconChevronRight size={18} /> : <IconChevronDown size={18} />}
								<span className="ms-2">
									{tag ? (
										<TagChip tag={tag} className="fs-5 px-2 py-1" />
									) : (
										<span className="badge bg-secondary fs-5 px-2 py-1">
											<T id="tag-groups.untagged" />
										</span>
									)}
								</span>
								<span className="text-muted ms-3 small">{groupHosts.length}</span>
							</button>
							{!isCollapsed ? (
								<div className="card-body">
									{groupHosts.length ? (
										<div className="row row-cards">
											{groupHosts.map((h) => (
												<HostCard key={`${h.type}-${h.id}`} host={h} />
											))}
										</div>
									) : (
										<div className="text-muted">
											<T id="tags.unused" />
										</div>
									)}
								</div>
							) : null}
						</div>
					);
				})
			)}
		</div>
	);
}
