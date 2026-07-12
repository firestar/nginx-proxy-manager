import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import { type BackupImportResult, downloadBackup, importBackup, runBackupNow } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useBackupHistory, useBackupSchedule, useSetBackupSchedule } from "src/hooks";
import { showObjectSuccess } from "src/notifications";

const actionColor: Record<string, string> = {
	create: "text-green",
	update: "text-blue",
	skip: "text-muted",
	conflict: "text-red",
};

const humanSize = (bytes: number) => {
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
};

export default function Backup() {
	const { data: schedule, isLoading } = useBackupSchedule();
	const { mutate: setSchedule } = useSetBackupSchedule();
	const { data: history, refetch: refetchHistory } = useBackupHistory();

	// Download
	const [dlEncrypt, setDlEncrypt] = useState(false);
	const [dlPass, setDlPass] = useState("");

	// Import
	const [file, setFile] = useState<File | null>(null);
	const [impPass, setImpPass] = useState("");
	const [plan, setPlan] = useState<BackupImportResult | null>(null);
	const [report, setReport] = useState<BackupImportResult | null>(null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const doDownload = async () => {
		setErr(null);
		try {
			await downloadBackup(dlEncrypt ? dlPass : undefined);
		} catch (e: any) {
			setErr(e.message);
		}
	};

	const doDryRun = async () => {
		if (!file) return;
		setBusy(true);
		setErr(null);
		setReport(null);
		try {
			setPlan(await importBackup(file, impPass, true));
		} catch (e: any) {
			setErr(e.message);
		} finally {
			setBusy(false);
		}
	};

	const doImport = async () => {
		if (!file) return;
		setBusy(true);
		setErr(null);
		try {
			const res = await importBackup(file, impPass, false);
			setReport(res);
			setPlan(null);
			showObjectSuccess("backup", "imported");
		} catch (e: any) {
			setErr(e.message);
		} finally {
			setBusy(false);
		}
	};

	const doRunNow = async () => {
		setBusy(true);
		setErr(null);
		try {
			await runBackupNow();
			showObjectSuccess("backup", "created");
			refetchHistory();
		} catch (e: any) {
			setErr(e.message);
		} finally {
			setBusy(false);
		}
	};

	if (isLoading) {
		return (
			<div className="card-body">
				<Loading noLogo />
			</div>
		);
	}

	const s3 = schedule?.s3;

	return (
		<div className="card-body">
			{err ? (
				<Alert variant="danger" show dismissible onClose={() => setErr(null)}>
					{err}
				</Alert>
			) : null}

			{/* Download now */}
			<h3>Download backup</h3>
			<p className="text-muted">
				Exports all hosts, certificates, access lists, tags, settings and users (without secrets) as a tar.gz
				archive.
			</p>
			<div className="mb-2">
				<label className="form-check form-switch">
					<input
						type="checkbox"
						className="form-check-input"
						checked={dlEncrypt}
						onChange={(e) => setDlEncrypt(e.target.checked)}
					/>
					<span className="form-check-label">Encrypt with a passphrase (AES-256-GCM)</span>
				</label>
			</div>
			{dlEncrypt ? (
				<input
					type="password"
					className="form-control mb-2"
					placeholder="Passphrase"
					autoComplete="new-password"
					value={dlPass}
					onChange={(e) => setDlPass(e.target.value)}
				/>
			) : null}
			<Button actionType="primary" onClick={doDownload} disabled={dlEncrypt && !dlPass}>
				Download now
			</Button>

			<hr />

			{/* Import */}
			<h3>Restore / import</h3>
			<p className="text-muted">
				Upload a backup archive, preview the changes, then confirm. Import runs in a single transaction and
				regenerates configs through the safe nginx test path.
			</p>
			<input
				type="file"
				className="form-control mb-2"
				accept=".gz,.enc,.tar,application/gzip"
				onChange={(e) => {
					setFile(e.target.files?.[0] ?? null);
					setPlan(null);
					setReport(null);
				}}
			/>
			<input
				type="password"
				className="form-control mb-2"
				placeholder="Passphrase (only for encrypted archives)"
				autoComplete="new-password"
				value={impPass}
				onChange={(e) => setImpPass(e.target.value)}
			/>
			<div className="btn-list">
				<Button actionType="secondary" onClick={doDryRun} disabled={!file || busy}>
					Preview (dry run)
				</Button>
				{plan ? (
					<Button actionType="primary" onClick={doImport} disabled={busy}>
						Confirm import
					</Button>
				) : null}
			</div>

			{plan ? (
				<div className="mt-3">
					<div className="mb-2">
						{Object.entries(plan.summary || {}).map(([k, v]) => (
							<span key={k} className={`badge me-2 ${actionColor[k] || ""}`}>
								{v} {k}
							</span>
						))}
					</div>
					<PlanTable items={plan.items} />
				</div>
			) : null}

			{report ? (
				<div className="mt-3">
					<Alert variant="success" show>
						Import complete — {report.items.filter((i) => i.action === "create").length} created,{" "}
						{report.items.filter((i) => i.action === "update").length} updated.
					</Alert>
					<PlanTable items={report.items} />
					{report.regenerated?.some((r) => !r.ok) ? (
						<Alert variant="warning" show>
							Some configs failed nginx validation:{" "}
							{report.regenerated
								.filter((r) => !r.ok)
								.map((r) => `${r.type}#${r.id}`)
								.join(", ")}
						</Alert>
					) : null}
				</div>
			) : null}

			<hr />

			{/* Schedule + S3 */}
			<h3>Scheduled backups (S3 / MinIO)</h3>
			<Formik
				enableReinitialize
				initialValues={{
					enabled: schedule?.enabled ?? false,
					cron: schedule?.cron ?? "0 3 * * *",
					retentionCount: schedule?.retentionCount ?? 7,
					encrypt: schedule?.encrypt ?? false,
					passphrase: "",
					endpoint: s3?.endpoint ?? "",
					region: s3?.region ?? "us-east-1",
					bucket: s3?.bucket ?? "",
					accessKey: s3?.accessKey ?? "",
					secretKey: "",
					prefix: s3?.prefix ?? "npm-backups",
					forcePathStyle: s3?.forcePathStyle ?? true,
				}}
				onSubmit={(values, { setSubmitting }) => {
					const payload: Record<string, any> = {
						enabled: values.enabled,
						cron: values.cron,
						retentionCount: Number(values.retentionCount),
						encrypt: values.encrypt,
						s3: {
							endpoint: values.endpoint,
							region: values.region,
							bucket: values.bucket,
							accessKey: values.accessKey,
							prefix: values.prefix,
							forcePathStyle: values.forcePathStyle,
						},
					};
					// Write-only secrets: only send when the user typed a new value.
					if (values.passphrase) payload.passphrase = values.passphrase;
					if (values.secretKey) payload.s3.secretKey = values.secretKey;
					setErr(null);
					setSchedule(payload, {
						onError: (e: any) => setErr(e.message),
						onSuccess: () => showObjectSuccess("backup", "saved"),
						onSettled: () => setSubmitting(false),
					});
				}}
			>
				{({ values, isSubmitting }) => (
					<Form>
						<label className="form-check form-switch mb-3">
							<Field type="checkbox" name="enabled" className="form-check-input" />
							<span className="form-check-label">Enable scheduled backups</span>
						</label>
						<div className="row">
							<div className="mb-3 col-md-6">
								<label className="form-label">Cron schedule</label>
								<Field name="cron" className="form-control" placeholder="0 3 * * *" />
								<small className="text-muted">Standard 5-field cron (minute hour dom month dow).</small>
							</div>
							<div className="mb-3 col-md-6">
								<label className="form-label">Retention count</label>
								<Field type="number" name="retentionCount" className="form-control" min={1} />
							</div>
						</div>
						<label className="form-check form-switch mb-2">
							<Field type="checkbox" name="encrypt" className="form-check-input" />
							<span className="form-check-label">Encrypt scheduled archives</span>
						</label>
						{values.encrypt ? (
							<Field
								type="password"
								name="passphrase"
								className="form-control mb-3"
								placeholder={schedule?.hasPassphrase ? "•••••• (unchanged)" : "Passphrase"}
								autoComplete="new-password"
							/>
						) : null}

						<h4 className="mt-3">S3 / MinIO destination</h4>
						<div className="row">
							<div className="mb-3 col-md-6">
								<label className="form-label">Endpoint</label>
								<Field name="endpoint" className="form-control" placeholder="https://s3.amazonaws.com or http://minio:9000" />
							</div>
							<div className="mb-3 col-md-6">
								<label className="form-label">Region</label>
								<Field name="region" className="form-control" placeholder="us-east-1" />
							</div>
							<div className="mb-3 col-md-6">
								<label className="form-label">Bucket</label>
								<Field name="bucket" className="form-control" />
							</div>
							<div className="mb-3 col-md-6">
								<label className="form-label">Prefix</label>
								<Field name="prefix" className="form-control" placeholder="npm-backups" />
							</div>
							<div className="mb-3 col-md-6">
								<label className="form-label">Access key</label>
								<Field name="accessKey" className="form-control" autoComplete="off" />
							</div>
							<div className="mb-3 col-md-6">
								<label className="form-label">Secret key</label>
								<Field
									type="password"
									name="secretKey"
									className="form-control"
									autoComplete="new-password"
									placeholder={s3?.hasSecretKey ? "•••••• (unchanged)" : ""}
								/>
							</div>
						</div>
						<label className="form-check mb-3">
							<Field type="checkbox" name="forcePathStyle" className="form-check-input" />
							<span className="form-check-label">Force path-style addressing (required for MinIO)</span>
						</label>
						<div className="btn-list">
							<Button type="submit" actionType="primary" isLoading={isSubmitting} disabled={isSubmitting}>
								Save schedule
							</Button>
							<Button actionType="secondary" onClick={doRunNow} disabled={busy}>
								Run backup now
							</Button>
						</div>
					</Form>
				)}
			</Formik>

			<hr />

			{/* History */}
			<h3>Run history</h3>
			{history && history.length ? (
				<div className="table-responsive">
					<table className="table table-sm">
						<thead>
							<tr>
								<th>When</th>
								<th>Status</th>
								<th>Trigger</th>
								<th>Destination</th>
								<th>Size</th>
								<th>Detail</th>
							</tr>
						</thead>
						<tbody>
							{history.map((r) => (
								<tr key={r.id}>
									<td>{r.createdOn}</td>
									<td className={r.status === "ok" ? "text-green" : "text-red"}>{r.status}</td>
									<td>{r.trigger}</td>
									<td>
										{r.destination}
										{r.encrypted ? " 🔒" : ""}
									</td>
									<td>{humanSize(r.size)}</td>
									<td className="text-muted">{r.error || r.s3Key || r.filename || ""}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="text-muted">No backups have run yet.</p>
			)}
		</div>
	);
}

function PlanTable({ items }: { items: BackupImportResult["items"] }) {
	return (
		<div className="table-responsive">
			<table className="table table-sm">
				<thead>
					<tr>
						<th>Type</th>
						<th>Name</th>
						<th>Action</th>
					</tr>
				</thead>
				<tbody>
					{items.map((it, idx) => (
						<tr key={`${it.type}-${it.name}-${idx}`}>
							<td>{it.type}</td>
							<td>{it.name}</td>
							<td className={actionColor[it.action] || ""}>{it.action}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
