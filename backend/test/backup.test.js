import assert from "node:assert/strict";
import { describe, it } from "node:test";
import archive from "../lib/backup/archive.js";
import cron from "../lib/backup/cron.js";
import s3 from "../lib/backup/s3.js";

describe("backup archive", () => {
	const entries = [
		{ name: "manifest.json", data: JSON.stringify({ schema_version: 1, hello: "world" }) },
		{ name: "certs/live/1/fullchain.pem", data: Buffer.from("PEMDATA") },
	];

	it("round-trips a plain tar.gz archive", async () => {
		const buf = await archive.pack(entries);
		assert.equal(archive.isEncrypted(buf), false);
		// gzip magic
		assert.equal(buf[0], 0x1f);
		assert.equal(buf[1], 0x8b);
		const files = await archive.unpack(buf);
		assert.equal(files.get("manifest.json").toString(), entries[0].data);
		assert.equal(files.get("certs/live/1/fullchain.pem").toString(), "PEMDATA");
	});

	it("round-trips an encrypted archive with the right passphrase", async () => {
		const buf = await archive.pack(entries, { passphrase: "s3cr3t" });
		assert.equal(archive.isEncrypted(buf), true);
		const files = await archive.unpack(buf, { passphrase: "s3cr3t" });
		assert.equal(files.get("manifest.json").toString(), entries[0].data);
	});

	it("fails to decrypt with a wrong passphrase", async () => {
		const buf = await archive.pack(entries, { passphrase: "right" });
		await assert.rejects(() => archive.unpack(buf, { passphrase: "wrong" }));
	});

	it("requires a passphrase for an encrypted archive", async () => {
		const buf = await archive.pack(entries, { passphrase: "right" });
		await assert.rejects(() => archive.unpack(buf), /encrypted/);
	});
});

describe("backup cron matcher", () => {
	it("matches a specific minute/hour", () => {
		const d = new Date(2026, 0, 15, 3, 0, 0); // Jan 15 2026 03:00 local
		assert.equal(cron.matches("0 3 * * *", d), true);
		assert.equal(cron.matches("0 4 * * *", d), false);
	});

	it("supports steps and ranges", () => {
		assert.equal(cron.matches("*/15 * * * *", new Date(2026, 0, 1, 0, 30)), true);
		assert.equal(cron.matches("*/15 * * * *", new Date(2026, 0, 1, 0, 31)), false);
		assert.equal(cron.matches("0 9-17 * * *", new Date(2026, 0, 1, 12, 0)), true);
		assert.equal(cron.matches("0 9-17 * * *", new Date(2026, 0, 1, 18, 0)), false);
	});

	it("treats DOM and DOW as OR when both are restricted", () => {
		// 2026-01-15 is a Thursday (dow=4)
		const thu = new Date(2026, 0, 15, 0, 0);
		assert.equal(cron.matches("0 0 15 * *", thu), true); // matches DOM
		assert.equal(cron.matches("0 0 1 * 4", thu), true); // matches DOW even though DOM=1 doesn't
	});

	it("rejects malformed expressions", () => {
		assert.throws(() => cron.parse("* * *"));
		assert.throws(() => cron.parse("99 * * * *"));
	});
});

describe("backup s3 client", () => {
	it("uri-encodes reserved characters per RFC3986", () => {
		assert.equal(s3.uriEncode("a b/c", true), "a%20b%2Fc");
		assert.equal(s3.uriEncode("a b/c", false), "a%20b/c");
		assert.equal(s3.uriEncode("weird!*'()", true), "weird%21%2A%27%28%29");
	});

	it("parses keys from a ListObjectsV2 response", async () => {
		const xml = `<?xml version="1.0"?><ListBucketResult>
			<Contents><Key>npm-backups/a.tar.gz</Key><Size>10</Size><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>
			<Contents><Key>npm-backups/b.tar.gz</Key><Size>20</Size><LastModified>2026-01-02T00:00:00Z</LastModified></Contents>
			<IsTruncated>false</IsTruncated></ListBucketResult>`;
		const orig = globalThis.fetch;
		globalThis.fetch = async () => ({ ok: true, status: 200, statusText: "OK", text: async () => xml });
		try {
			const cfg = { endpoint: "http://minio:9000", region: "us-east-1", bucket: "b", access_key: "k", secret_key: "s" };
			const objects = await s3.listObjects(cfg, "npm-backups/");
			assert.equal(objects.length, 2);
			assert.deepEqual(
				objects.map((o) => o.key),
				["npm-backups/a.tar.gz", "npm-backups/b.tar.gz"],
			);
			assert.equal(objects[1].size, 20);
		} finally {
			globalThis.fetch = orig;
		}
	});
});
