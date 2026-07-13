import express from "express";
import internalReport from "../internal/report.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/hosts")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/hosts
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalReport.getHostsReport(res.locals.access);
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/proxy-hosts/metrics")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/proxy-hosts/metrics?range=1h|24h|7d|30d
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalReport.getMetricsOverview(res.locals.access, {
				range: req.query.range,
			});
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/proxy-hosts/:id/metrics")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/proxy-hosts/:id/metrics
	 */
	.get(async (req, res, next) => {
		try {
		const data = await internalReport.getProxyHostMetrics(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
				range: req.query.range,
				breakdown: req.query.breakdown === "1" || req.query.breakdown === "true",
			});
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});


router
	.route("/uptime")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/uptime
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalReport.getUptimeReport(res.locals.access);
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/nodes/metrics")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/nodes/metrics
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalReport.getNodesMetrics(res.locals.access);
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});


router
	.route("/nodes/:id/metrics")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /reports/nodes/:id/metrics?range=1h|24h|7d|30d
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalReport.getNodeMetrics(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
				range: req.query.range,
			});
			res.status(200).send(data);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});
export default router;
