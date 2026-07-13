import { IconAlertTriangle, IconHelp, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { useSearchParams } from "react-router-dom";
import { deleteCertificate, downloadCertificate } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useCertificates } from "src/hooks";
import { intl, T } from "src/locale";
import {
	showCustomCertificateModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showHelpModal,
	showHTTPCertificateModal,
	showRenewCertificateModal,
} from "src/modals";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";
import { showError, showObjectSuccess } from "src/notifications";
import Table from "./Table";

type ProviderFilter = "all" | "letsencrypt-http" | "letsencrypt-dns" | "custom";
type ExpiryFilter = "all" | "expiring" | "expired";

const providerOf = (cert: any): "letsencrypt-http" | "letsencrypt-dns" | "custom" => {
	if (cert.provider === "letsencrypt") {
		return cert.meta?.dnsChallenge ? "letsencrypt-dns" : "letsencrypt-http";
	}
	return "custom";
};

const providerLabel = (cert: any): string => {
	if (cert.provider === "letsencrypt") {
		if (cert.meta?.dnsChallenge && cert.meta?.dnsProvider) {
			return `Let's Encrypt ${cert.meta.dnsProvider}`;
		}
		return "Let's Encrypt";
	}
	if (cert.provider === "other") return "Custom";
	return cert.provider || "";
};

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
	const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		const f = searchParams.get("filter");
		if (f === "expiring") setExpiryFilter("expiring");
		else if (f === "expired") setExpiryFilter("expired");
	}, [searchParams]);

	const { isFetching, isLoading, isError, error, data } = useCertificates([
		"owner",
		"dead_hosts",
		"proxy_hosts",
		"redirection_hosts",
		"streams",
	]);

	const now = useMemo(() => new Date().toISOString(), []);
	const in30d = useMemo(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), []);

	const expiringCount = useMemo(() => {
		if (!data) return 0;
		return data.filter((c: any) => c.expiresOn && c.expiresOn > now && c.expiresOn <= in30d).length;
	}, [data, now, in30d]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteCertificate(id);
		showObjectSuccess("certificate", "deleted");
	};

	const handleDownload = async (id: number) => {
		try {
			await downloadCertificate(id);
		} catch (err: any) {
			showError(err.message);
		}
	};

	const applyExpiringFilter = () => {
		setExpiryFilter("expiring");
		const next = new URLSearchParams(searchParams);
		next.set("filter", "expiring");
		setSearchParams(next, { replace: true });
	};

	let filtered: any = null;
	const hasFilters = !!search || providerFilter !== "all" || expiryFilter !== "all";
	if (hasFilters && data) {
		filtered = data.filter((item: any) => {
			if (search) {
				const s = search;
				const matches =
					item.domainNames.some((d: string) => d.toLowerCase().includes(s)) ||
					item.niceName.toLowerCase().includes(s) ||
					providerLabel(item).toLowerCase().includes(s);
				if (!matches) return false;
			}
			if (providerFilter !== "all" && providerOf(item) !== providerFilter) return false;
			if (expiryFilter === "expiring") {
				if (!(item.expiresOn && item.expiresOn > now && item.expiresOn <= in30d)) return false;
			} else if (expiryFilter === "expired") {
				if (!(item.expiresOn && item.expiresOn <= now)) return false;
			}
			return true;
		});
	} else if (search !== "") {
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-pink" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="certificates" />
							</h2>
						</div>
						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list align-items-center gap-2">
								{data?.length ? (
									<>
										<select
											className="form-select form-select-sm w-auto"
											aria-label={intl.formatMessage({ id: "filter.provider" })}
											value={providerFilter}
											onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
										>
											<option value="all">
												{intl.formatMessage({ id: "filter.provider.all" })}
											</option>
											<option value="letsencrypt-http">
												{intl.formatMessage({ id: "lets-encrypt-via-http" })}
											</option>
											<option value="letsencrypt-dns">
												{intl.formatMessage({ id: "lets-encrypt-via-dns" })}
											</option>
											<option value="custom">
												{intl.formatMessage({ id: "certificates.custom" })}
											</option>
										</select>
										<select
											className="form-select form-select-sm w-auto"
											aria-label={intl.formatMessage({ id: "filter.expiry" })}
											value={expiryFilter}
											onChange={(e) => {
												const v = e.target.value as ExpiryFilter;
												setExpiryFilter(v);
												const next = new URLSearchParams(searchParams);
												if (v === "all") next.delete("filter");
												else next.set("filter", v);
												setSearchParams(next, { replace: true });
											}}
										>
											<option value="all">
												{intl.formatMessage({ id: "filter.expiry.all" })}
											</option>
											<option value="expiring">
												{intl.formatMessage({ id: "filter.expiring-30d" })}
											</option>
											<option value="expired">
												{intl.formatMessage({ id: "filter.expired" })}
											</option>
										</select>
										<div className="input-group input-group-flat w-auto">
											<span className="input-group-text input-group-text-sm">
												<IconSearch size={16} />
											</span>
											<input
												id="advanced-table-search"
												type="text"
												className="form-control form-control-sm"
												autoComplete="off"
												onChange={(e: any) => setSearch(e.target.value.toLowerCase().trim())}
											/>
										</div>
									</>
								) : null}
								<Button size="sm" onClick={() => showHelpModal("Certificates", "pink")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
									{data?.length ? (
										<div className="dropdown">
											<button
												type="button"
												className="btn btn-sm dropdown-toggle btn-pink mt-1"
												data-bs-toggle="dropdown"
											>
												<T id="object.add" tData={{ object: "certificate" }} />
											</button>
											<div className="dropdown-menu">
												<a
													className="dropdown-item"
													href="#"
													onClick={(e) => {
														e.preventDefault();
														showHTTPCertificateModal();
													}}
												>
													<T id="lets-encrypt-via-http" />
												</a>
												<a
													className="dropdown-item"
													href="#"
													onClick={(e) => {
														e.preventDefault();
														showDNSCertificateModal();
													}}
												>
													<T id="lets-encrypt-via-dns" />
												</a>
												<div className="dropdown-divider" />
												<a
													className="dropdown-item"
													href="#"
													onClick={(e) => {
														e.preventDefault();
														showCustomCertificateModal();
													}}
												>
													<T id="certificates.custom" />
												</a>
											</div>
										</div>
									) : null}
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				{expiringCount > 0 && expiryFilter !== "expiring" ? (
					<Alert variant="warning" className="mb-0 rounded-0 d-flex align-items-center gap-2">
						<IconAlertTriangle size={20} />
						<span className="flex-grow-1">
							<T id="certificates.expiring-banner" data={{ count: expiringCount }} />
						</span>
						<button type="button" className="btn btn-sm btn-warning" onClick={applyExpiringFilter}>
							<T id="action.show-expiring" />
						</button>
					</Alert>
				) : null}
				<Table
					data={filtered ?? data ?? []}
					isFiltered={hasFilters}
					isFetching={isFetching}
					onRenew={showRenewCertificateModal}
					onDownload={handleDownload}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "certificate" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["certificates"], ["certificate", id]],
							children: <T id="object.delete.content" tData={{ object: "certificate" }} />,
						})
					}
				/>
			</div>
		</div>
	);
}
