import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
	CommandPalette,
	ErrorNotFound,
	LoadingPage,
	Page,
	SiteContainer,
	SiteFooter,
	SiteHeader,
	SiteMenu,
	Unhealthy,
} from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";

const Setup = lazy(() => import("src/pages/Setup"));
const Login = lazy(() => import("src/pages/Login"));
const Dashboard = lazy(() => import("src/pages/Dashboard"));
const Settings = lazy(() => import("src/pages/Settings"));
const Certificates = lazy(() => import("src/pages/Certificates"));
const Access = lazy(() => import("src/pages/Access"));
const Tags = lazy(() => import("src/pages/Tags"));
const TagGroups = lazy(() => import("src/pages/TagGroups"));
const AuditLog = lazy(() => import("src/pages/AuditLog"));
const Users = lazy(() => import("src/pages/Users"));
const ApiKeys = lazy(() => import("src/pages/ApiKeys"));
const Nodes = lazy(() => import("src/pages/Nodes"));
const ProxyHosts = lazy(() => import("src/pages/Nginx/ProxyHosts"));
const RedirectionHosts = lazy(() => import("src/pages/Nginx/RedirectionHosts"));
const Streams = lazy(() => import("src/pages/Nginx/Streams"));
const DeadHosts = lazy(() => import("src/pages/Nginx/DeadHosts"));
const PublicStatusPage = lazy(() => import("src/pages/PublicStatus"));

function Router() {
	const health = useHealth();
	const { authenticated } = useAuthState();
	const path = window.location.pathname;

	// Public status page — bypasses all auth checks
	if (path.startsWith("/status/")) {
		return (
			<BrowserRouter>
				<Suspense fallback={<LoadingPage />}>
					<Routes>
						<Route path="/status/:slug" element={<PublicStatusPage />} />
					</Routes>
				</Suspense>
			</BrowserRouter>
		);
	}
	if (health.isLoading) {
		return <LoadingPage />;
	}

	if (health.isError || health.data?.status !== "OK") {
		return <Unhealthy />;
	}

	if (!health.data?.setup) {
		return <Setup />;
	}

	if (!authenticated) {
		return (
			<Suspense fallback={<LoadingPage />}>
				<Login />
			</Suspense>
		);
	}

	return (
		<BrowserRouter>
			<CommandPalette />
			<Page>
				<div>
					<SiteHeader />
					<SiteMenu />
				</div>
				<SiteContainer>
					<Suspense fallback={<LoadingPage noLogo />}>
						<Routes>
							<Route path="*" element={<ErrorNotFound />} />
							<Route path="/certificates" element={<Certificates />} />
							<Route path="/access" element={<Access />} />
							<Route path="/tags" element={<Tags />} />
							<Route path="/groups" element={<TagGroups />} />
							<Route path="/audit-log" element={<AuditLog />} />
							<Route path="/settings" element={<Settings />} />
							<Route path="/users" element={<Users />} />
							<Route path="/api-keys" element={<ApiKeys />} />
							<Route path="/nginx/proxy" element={<ProxyHosts />} />
							<Route path="/nodes" element={<Nodes />} />
							<Route path="/nginx/redirection" element={<RedirectionHosts />} />
							<Route path="/nginx/404" element={<DeadHosts />} />
							<Route path="/nginx/stream" element={<Streams />} />
							<Route path="/" element={<Dashboard />} />
						</Routes>
					</Suspense>
				</SiteContainer>
				<SiteFooter />
			</Page>
		</BrowserRouter>
	);
}

export default Router;
