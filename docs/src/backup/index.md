# Backup &amp; Restore

Nginx Proxy Manager can export your entire configuration to a single `tar.gz`
archive, restore it on the same or another instance, and run scheduled backups
that upload to any S3-compatible object store (AWS S3, MinIO, etc.).

Everything lives under **Settings → Backup &amp; Restore** (admin only).

## What is in a backup

A backup archive contains a `manifest.json` plus on-disk certificate material:

- Proxy hosts, redirection hosts, 404 hosts and TCP/UDP streams
- Access lists (with their authorisation items and client rules)
- Certificates (metadata **and** the live certificate/key files on disk)
- Tags and their host assignments
- Users (accounts only — **password hashes and API-key secrets are never
  exported**) and per-user tag assignments
- Settings
- Custom nginx snippets (`/data/nginx/custom`) and maintenance pages
  (`/data/nginx/maintenance`)

## Download a backup

1. Open **Settings → Backup &amp; Restore**.
2. (Optional) Toggle **Encrypt with a passphrase** and enter one. The archive
   is encrypted with AES-256-GCM (scrypt key derivation, random salt + nonce).
   Because certificate private keys are inside the archive, encryption is
   strongly recommended when storing backups off-box.
3. Click **Download now**.

## Restore / import

Import is a two-step, non-destructive flow:

1. Choose a backup file (and passphrase, if it was encrypted).
2. Click **Preview (dry run)**. The server reports a per-item plan without
   writing anything:
   - `create` — item does not exist and will be added
   - `update` — item exists and differs; it will be updated
   - `skip` — item exists and is identical
   - `conflict` — more than one existing item matches; it will be left alone
3. Review the plan, then click **Confirm import**. The import runs in a single
   database transaction with ID remapping (owners, certificates, access lists
   and tags are re-linked to their new IDs). Afterwards every restored host has
   its nginx config regenerated through the safe `nginx -t` validation path, and
   a per-item result report is shown.

Existing items matched by their natural key (domain names, certificate name,
access-list name, etc.) are never blindly overwritten with duplicates.

## Scheduled backups to S3 / MinIO

Configure a schedule to back up automatically and push the archive to object
storage:

| Field | Notes |
| --- | --- |
| **Cron schedule** | Standard 5-field cron (`minute hour day-of-month month day-of-week`), evaluated in the server's local time. |
| **Retention count** | Old archives beyond this count are pruned from the bucket after each run. |
| **Encrypt** | Encrypt scheduled archives with a write-only passphrase. |
| **Endpoint** | S3 endpoint. For AWS use `https://s3.amazonaws.com`; for MinIO use e.g. `http://minio:9000`. |
| **Region** | e.g. `us-east-1`. |
| **Bucket / Prefix** | Destination bucket and key prefix (default `npm-backups`). |
| **Access key / Secret key** | Credentials. The secret key is **write-only** and is never returned by the API. |
| **Force path-style** | Required for MinIO and most non-AWS servers. |

Secret fields (S3 secret key, passphrase) are write-only: leaving them blank
keeps the stored value. Use **Run backup now** to test the configuration
immediately. Each run is recorded in **Run history**, and success/failure emits
`backup.ok` / `backup.failed` events that notification channels can subscribe
to.

## MCP tools

When using the MCP server with a scoped API key, two tools are available behind
the `backup:manage` / `backup:view` scopes:

- `npm_create_backup` — run a backup now (uploads to S3 when configured).
- `npm_get_backup_schedule` — read the schedule (secrets are never returned).

## Notes &amp; limitations

- Only certificate **live** material needed to serve TLS is restored; Let's
  Encrypt renewal metadata is not, so renewals re-issue as needed.
- Imported users have no credentials until an admin sets them.
- The `backup-schedule` settings row (including S3 credentials) is intentionally
  **not** overwritten by an import, so restoring a backup never clobbers the
  target instance's own destination configuration.
