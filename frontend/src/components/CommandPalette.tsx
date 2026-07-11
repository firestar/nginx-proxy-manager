import { IconMoon, IconPlus, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";
import { useNavigate } from "react-router-dom";
import { useDeadHosts, useProxyHosts, useRedirectionHosts, useStreams, useTags, useTheme } from "src/hooks";
import { intl, T } from "src/locale";
import {
	showDeadHostModal,
	showProxyHostModal,
	showRedirectionHostModal,
	showStreamModal,
	showTagModal,
} from "src/modals";

interface PaletteItem {
	key: string;
	group: string;
	label: string;
	sublabel?: string;
	action: () => void;
}

const PAGES: { label: string; to: string }[] = [
	{ label: "dashboard", to: "/" },
	{ label: "proxy-hosts", to: "/nginx/proxy" },
	{ label: "redirection-hosts", to: "/nginx/redirection" },
	{ label: "streams", to: "/nginx/stream" },
	{ label: "dead-hosts", to: "/nginx/404" },
	{ label: "access-lists", to: "/access" },
	{ label: "tags", to: "/tags" },
	{ label: "tag-groups", to: "/groups" },
	{ label: "certificates", to: "/certificates" },
	{ label: "users", to: "/users" },
	{ label: "auditlogs", to: "/audit-log" },
	{ label: "settings", to: "/settings" },
];

export function CommandPalette() {
	const navigate = useNavigate();
	const { toggleTheme } = useTheme();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	// Host/tag data only fetched while the palette is open.
	const { data: proxyHosts } = useProxyHosts([], { enabled: open });
	const { data: redirectionHosts } = useRedirectionHosts([], { enabled: open });
	const { data: deadHosts } = useDeadHosts([], { enabled: open });
	const { data: streams } = useStreams([], { enabled: open });
	const { data: tags } = useTags([], { enabled: open });

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const close = () => {
		setOpen(false);
		setQuery("");
		setActiveIndex(0);
	};

	const items = useMemo<PaletteItem[]>(() => {
		const q = query.toLowerCase().trim();
		const matches = (...parts: (string | undefined)[]) =>
			!q || parts.some((p) => p?.toLowerCase().includes(q));

		const result: PaletteItem[] = [];

		for (const page of PAGES) {
			const label = intl.formatMessage({ id: page.label });
			if (matches(label)) {
				result.push({
					key: `page-${page.to}`,
					group: "command-palette.pages",
					label,
					action: () => navigate(page.to),
				});
			}
		}

		const actions: { key: string; label: string; action: () => void }[] = [
			{
				key: "new-proxy-host",
				label: intl.formatMessage({ id: "object.add" }, { object: intl.formatMessage({ id: "proxy-host" }) }),
				action: () => showProxyHostModal("new"),
			},
			{
				key: "new-redirection-host",
				label: intl.formatMessage(
					{ id: "object.add" },
					{ object: intl.formatMessage({ id: "redirection-host" }) },
				),
				action: () => showRedirectionHostModal("new"),
			},
			{
				key: "new-stream",
				label: intl.formatMessage({ id: "object.add" }, { object: intl.formatMessage({ id: "stream" }) }),
				action: () => showStreamModal("new"),
			},
			{
				key: "new-dead-host",
				label: intl.formatMessage({ id: "object.add" }, { object: intl.formatMessage({ id: "dead-host" }) }),
				action: () => showDeadHostModal("new"),
			},
			{
				key: "new-tag",
				label: intl.formatMessage({ id: "object.add" }, { object: intl.formatMessage({ id: "tag" }) }),
				action: () => showTagModal("new"),
			},
			{
				key: "toggle-theme",
				label: intl.formatMessage({ id: "command-palette.toggle-theme" }),
				action: () => toggleTheme(),
			},
		];
		for (const action of actions) {
			if (matches(action.label)) {
				result.push({
					key: `action-${action.key}`,
					group: "command-palette.actions",
					label: action.label,
					action: action.action,
				});
			}
		}

		if (q) {
			proxyHosts?.forEach((h) => {
				const title = h.domainNames?.join(", ") || "";
				const sub = `${h.forwardHost}:${h.forwardPort}`;
				if (matches(title, sub)) {
					result.push({
						key: `proxy-${h.id}`,
						group: "proxy-hosts",
						label: title,
						sublabel: sub,
						action: () => showProxyHostModal(h.id || 0),
					});
				}
			});
			redirectionHosts?.forEach((h) => {
				const title = h.domainNames?.join(", ") || "";
				if (matches(title, h.forwardDomainName)) {
					result.push({
						key: `redirection-${h.id}`,
						group: "redirection-hosts",
						label: title,
						sublabel: h.forwardDomainName,
						action: () => showRedirectionHostModal(h.id || 0),
					});
				}
			});
			deadHosts?.forEach((h) => {
				const title = h.domainNames?.join(", ") || "";
				if (matches(title)) {
					result.push({
						key: `dead-${h.id}`,
						group: "dead-hosts",
						label: title,
						action: () => showDeadHostModal(h.id || 0),
					});
				}
			});
			streams?.forEach((h) => {
				const title = `${h.incomingPort}`;
				const sub = `${h.forwardingHost}:${h.forwardingPort}`;
				if (matches(title, sub)) {
					result.push({
						key: `stream-${h.id}`,
						group: "streams",
						label: title,
						sublabel: sub,
						action: () => showStreamModal(h.id || 0),
					});
				}
			});
			tags?.forEach((tag) => {
				if (matches(tag.name)) {
					result.push({
						key: `tag-${tag.id}`,
						group: "tags",
						label: tag.name,
						action: () => navigate("/groups"),
					});
				}
			});
		}

		return result.slice(0, 25);
	}, [query, proxyHosts, redirectionHosts, deadHosts, streams, tags, navigate, toggleTheme]);

	const run = (item: PaletteItem) => {
		close();
		item.action();
	};

	const onInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((prev) => Math.max(prev - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const item = items[activeIndex];
			if (item) run(item);
		}
	};

	let lastGroup = "";

	return (
		<Modal show={open} onHide={close} onEntered={() => inputRef.current?.focus()}>
			<div className="input-group input-group-flat border-bottom">
				<span className="input-group-text border-0 bg-transparent">
					<IconSearch size={18} />
				</span>
				<input
					ref={inputRef}
					type="text"
					className="form-control border-0 py-3"
					placeholder={intl.formatMessage({ id: "command-palette.placeholder" })}
					autoComplete="off"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setActiveIndex(0);
					}}
					onKeyDown={onInputKeyDown}
				/>
				<span className="input-group-text border-0 bg-transparent text-muted small">esc</span>
			</div>
			<div style={{ maxHeight: 380, overflowY: "auto" }} className="py-2">
				{items.length === 0 ? (
					<div className="text-center text-muted py-4">
						<T id="command-palette.no-results" />
					</div>
				) : (
					items.map((item, idx) => {
						const showGroup = item.group !== lastGroup;
						lastGroup = item.group;
						return (
							<div key={item.key}>
								{showGroup ? (
									<div className="px-3 pt-2 pb-1 text-uppercase text-muted small fw-bold">
										<T id={item.group} />
									</div>
								) : null}
								<button
									type="button"
									className={`d-flex align-items-center w-100 border-0 text-start px-3 py-2 ${
										idx === activeIndex ? "bg-primary-lt" : "bg-transparent"
									}`}
									style={{ cursor: "pointer" }}
									onMouseEnter={() => setActiveIndex(idx)}
									onClick={() => run(item)}
								>
									{item.group === "command-palette.actions" ? (
										item.key === "action-toggle-theme" ? (
											<IconMoon size={16} className="me-2 text-muted" />
										) : (
											<IconPlus size={16} className="me-2 text-muted" />
										)
									) : null}
									<span className="text-truncate">{item.label}</span>
									{item.sublabel ? (
										<span className="text-muted small ms-2 text-truncate">{item.sublabel}</span>
									) : null}
								</button>
							</div>
						);
					})
				)}
			</div>
		</Modal>
	);
}
