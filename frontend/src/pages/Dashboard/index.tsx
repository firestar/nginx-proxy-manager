import {
	IconArrowsCross,
	IconBolt,
	IconBoltOff,
	IconDisc,
	IconPlus,
	IconShield,
	IconShieldExclamation,
	IconTag,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { EventFormatter, GravatarFormatter, HasPermission } from "src/components";
import { useAuditLogs, useCertificates, useHostReport, useTags, useUser } from "src/hooks";
import { T } from "src/locale";
import {
	showDeadHostModal,
	showProxyHostModal,
	showRedirectionHostModal,
	showStreamModal,
	showTagModal,
} from "src/modals";
import {
	ADMIN,
	CERTIFICATES,
	DEAD_HOSTS,
	MANAGE,
	PROXY_HOSTS,
	REDIRECTION_HOSTS,
	type Section,
	STREAMS,
	VIEW,
} from "src/modules/Permissions";
import { TrafficCard } from "./TrafficCard";
import { T } from "src/locale";
import {
	showDeadHostModal,
	showProxyHostModal,
	showRedirectionHostModal,
	showStreamModal,
	showTagModal,
} from "src/modals";
import {
	ADMIN,
	CERTIFICATES,
	DEAD_HOSTS,
	MANAGE,
	PROXY_HOSTS,
	REDIRECTION_HOSTS,
	type Section,
	STREAMS,
	VIEW,
} from "src/modules/Permissions";

interface StatCard {
	labelId: string;
	count?: number;
	to: string;
	icon: ComponentType<{ size?: number | string }>;
	color: string;
	section?: Section;
}

const Dashboard = () => {
	const { data: hostReport } = useHostReport();
	const { data: certificates } = useCertificates();
	const { data: tags } = useTags();
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const { data: auditLogs } = useAuditLogs(["user"], { enabled: !!isAdmin });
	const navigate = useNavigate();

	const nowIso = new Date().toISOString();
	const in30dIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	const expiringCount = (certificates || []).filter(
		(c: any) => c.expiresOn && c.expiresOn > nowIso && c.expiresOn <= in30dIso,
	).length;

	const stats: StatCard[] = [
		{
			labelId: "proxy-hosts.count",
			count: hostReport?.proxy,
			to: "/nginx/proxy",
			icon: IconBolt,
			color: "green",
			section: PROXY_HOSTS,
		},
		{
			labelId: "redirection-hosts.count",
			count: hostReport?.redirection,
			to: "/nginx/redirection",
			icon: IconArrowsCross,
			color: "yellow",
			section: REDIRECTION_HOSTS,
		},
		{
			labelId: "streams.count",
			count: hostReport?.stream,
			to: "/nginx/stream",
			icon: IconDisc,
			color: "blue",
			section: STREAMS,
		},
		{
			labelId: "dead-hosts.count",
			count: hostReport?.dead,
			to: "/nginx/404",
			icon: IconBoltOff,
			color: "red",
			section: DEAD_HOSTS,
		},
		{
			labelId: "certificates.count",
			count: certificates?.length,
			to: "/certificates",
			icon: IconShield,
			color: "indigo",
			section: CERTIFICATES,
		},
		{
			labelId: "certificates.expiring.count",
			count: expiringCount,
			to: "/certificates?filter=expiring",
			icon: IconShieldExclamation,
			color: expiringCount > 0 ? "yellow" : "secondary",
			section: CERTIFICATES,
		},
		{
			labelId: "tags.count",
			count: tags?.length,
			to: "/tags",
			icon: IconTag,
			color: "purple",
		},
	];

	const quickActions: { labelObject: string; section?: Section; onClick: () => void }[] = [
		{ labelObject: "proxy-host", section: PROXY_HOSTS, onClick: () => showProxyHostModal("new") },
		{
			labelObject: "redirection-host",
			section: REDIRECTION_HOSTS,
			onClick: () => showRedirectionHostModal("new"),
		},
		{ labelObject: "stream", section: STREAMS, onClick: () => showStreamModal("new") },
		{ labelObject: "dead-host", section: DEAD_HOSTS, onClick: () => showDeadHostModal("new") },
		{ labelObject: "tag", onClick: () => showTagModal("new") },
	];

	return (
		<div className="mt-4">
			<h2 className="page-title mb-3">
				<T id="dashboard" />
			</h2>
			<div className="row row-cards mb-3">
				{stats.map((stat) => {
					const Icon = stat.icon;
					return (
						<HasPermission key={stat.to + stat.labelId} section={stat.section} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4 col-xl-2">
								<a
									href={stat.to}
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate(stat.to);
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className={`bg-${stat.color} text-white avatar`}>
													<Icon />
												</span>
											</div>
											<div className="col">
												<div className="font-weight-medium">
													<T id={stat.labelId} data={{ count: stat.count ?? 0 }} />
												</div>
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
					);
				})}
			</div>
			<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
				<TrafficCard />
			</HasPermission>
			<div className="row row-cards">
				<div className="col-lg-5">
					<div className="card">
						<div className="card-header">
							<h3 className="card-title">
								<T id="dashboard.quick-actions" />
							</h3>
						</div>
						<div className="card-body">
							<div className="d-flex flex-wrap gap-2">
								{quickActions.map((action) => (
									<HasPermission
										key={action.labelObject}
										section={action.section}
										permission={MANAGE}
										hideError
									>
										<button
											type="button"
											className="btn btn-outline-primary btn-sm"
											onClick={action.onClick}
										>
											<IconPlus size={16} className="me-1" />
											<T id="object.add" tData={{ object: action.labelObject }} />
										</button>
									</HasPermission>
								))}
							</div>
							<div className="text-muted small mt-3">
								<T id="dashboard.palette-hint" data={{ keys: "Ctrl/Cmd + K" }} />
							</div>
						</div>
					</div>
				</div>
				{isAdmin ? (
					<HasPermission section={ADMIN} permission={VIEW} hideError>
						<div className="col-lg-7">
							<div className="card">
								<div className="card-header">
									<h3 className="card-title">
										<T id="dashboard.recent-activity" />
									</h3>
									<div className="card-actions">
										<button
											type="button"
											className="btn btn-link btn-sm p-0"
											onClick={() => navigate("/audit-log")}
										>
											<T id="auditlogs" />
										</button>
									</div>
								</div>
								<div className="list-group list-group-flush">
									{(auditLogs || []).slice(0, 8).map((event) => (
										<div key={event.id} className="list-group-item d-flex align-items-center gap-3">
											<GravatarFormatter
												url={event.user ? event.user.avatar : ""}
												name={event.user ? event.user.name : ""}
											/>
											<EventFormatter row={event} />
										</div>
									))}
									{!auditLogs?.length ? (
										<div className="list-group-item text-muted">
											<T id="command-palette.no-results" />
										</div>
									) : null}
								</div>
							</div>
						</div>
					</HasPermission>
				) : null}
			</div>
		</div>
	);
};

export default Dashboard;
