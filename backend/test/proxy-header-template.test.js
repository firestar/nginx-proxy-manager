import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Liquid } from "liquidjs";

const templateDir = path.resolve(import.meta.dirname, "../templates");
const engine = new Liquid({ root: templateDir });

async function renderHeaders(headers) {
	const tpl = fs.readFileSync(path.join(templateDir, "_headers.conf"), "utf8");
	return engine.parseAndRender(tpl, { headers });
}

describe("_headers.conf template", () => {
	it("emits nothing for null headers", async () => {
		const out = await renderHeaders(null);
		assert.ok(!/proxy_set_header|add_header|proxy_hide_header/.test(out));
	});

	it("emits nothing for empty array", async () => {
		const out = await renderHeaders([]);
		assert.ok(!/proxy_set_header|add_header|proxy_hide_header/.test(out));
	});

	it("request/set emits proxy_set_header with quoted value", async () => {
		const out = await renderHeaders([{ direction: "request", action: "set", name: "X-Real-IP", value: "$remote_addr" }]);
		assert.ok(out.includes('proxy_set_header X-Real-IP "$remote_addr";'));
	});

	it("request/remove emits proxy_set_header with empty string", async () => {
		const out = await renderHeaders([{ direction: "request", action: "remove", name: "X-Custom", value: "" }]);
		assert.ok(out.includes('proxy_set_header X-Custom "";'));
	});

	it("response/set emits add_header with always", async () => {
		const out = await renderHeaders([{ direction: "response", action: "set", name: "Cache-Control", value: "no-cache" }]);
		assert.ok(out.includes('add_header Cache-Control "no-cache" always;'));
	});

	it("response/remove emits proxy_hide_header", async () => {
		const out = await renderHeaders([{ direction: "response", action: "remove", name: "X-Powered-By", value: "" }]);
		assert.ok(out.includes("proxy_hide_header X-Powered-By;"));
	});

	it("multiple headers emit all directives", async () => {
		const out = await renderHeaders([
			{ direction: "request", action: "set", name: "X-A", value: "aaa" },
			{ direction: "response", action: "remove", name: "Server", value: "" },
		]);
		assert.ok(out.includes('proxy_set_header X-A "aaa";'));
		assert.ok(out.includes("proxy_hide_header Server;"));
	});
});
