import express from "express";
import internalBackup from "../internal/backup.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET /api/backup
 *
 * Admin-only. Streams a tar.gz backup archive. Pass ?passphrase=... to
 * receive an AES-256-GCM encrypted archive.
 */
router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			await res.locals.access.can("backup:manage");
			const passphrase = req.query.passphrase ? String(req.query.passphrase) : "";
			const { buffer, filename } = await internalBackup.build({ encrypt: !!passphrase, passphrase });
			res.set({
				"Content-Type": "application/gzip",
				"Content-Disposition": `attachment; filename="${filename}"`,
				"Content-Length": String(buffer.length),
			});
			res.status(200).send(buffer);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/backup/import?dry_run=1
 *
 * Admin-only. Upload a backup archive (multipart field `file`). With
 * ?dry_run=1 returns a per-item plan without writing anything; otherwise
 * imports in one transaction and returns a per-item result report.
 */
router
	.route("/import")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("backup:manage");
			if (!req.files || !req.files.file) {
				return res.status(400).send({ error: { message: "No backup file uploaded (field `file`)" } });
			}
			const buffer = req.files.file.data;
			const passphrase = req.body?.passphrase ? String(req.body.passphrase) : "";
			const dryRun = req.query.dry_run === "1" || req.query.dry_run === "true";
			if (dryRun) {
				const plan = await internalBackup.planImport(buffer, passphrase);
				return res.status(200).send({ dry_run: true, ...plan });
			}
			const report = await internalBackup.runImport(buffer, passphrase);
			res.status(200).send({ dry_run: false, ...report });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET/PUT /api/backup/schedule
 *
 * Read or update the scheduled S3/MinIO backup config. Secret fields
 * (s3.secret_key, passphrase) are write-only and never returned by GET.
 */
router
	.route("/schedule")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			await res.locals.access.can("backup:get");
			res.status(200).send(await internalBackup.getSchedule());
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("backup:manage");
			res.status(200).send(await internalBackup.setSchedule(req.body || {}));
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/backup/run
 *
 * Admin-only. Trigger a backup now (uploads to S3 if configured).
 */
router
	.route("/run")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("backup:manage");
			res.status(200).send(await internalBackup.run("manual"));
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * GET /api/backup/history
 *
 * Admin-only. Recent scheduled/manual backup runs.
 */
router
	.route("/history")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			await res.locals.access.can("backup:get");
			res.status(200).send(await internalBackup.getHistory());
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
