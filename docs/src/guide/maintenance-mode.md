# Maintenance Mode

Per-host maintenance mode lets you temporarily take a proxy host out of service while keeping TLS certificates live and renewable.

## How it works

When maintenance mode is **enabled** on a proxy host:

- Nginx continues to listen on the same ports and serve the same TLS certificate
- All requests receive a `503 Service Unavailable` response with a `Retry-After: 300` header
- A maintenance page is served (see [Custom page](#custom-page) below)
- Certificate renewal (HTTP-01 and DNS-01) continues to work normally because the ACME challenge paths are unaffected

When maintenance mode is **disabled**, the host resumes normal proxying immediately.

> **Note:** Maintenance mode requires the host to be enabled. You cannot activate maintenance mode on a disabled host.

## Toggling maintenance mode

### Via the UI

1. Open the **Proxy Hosts** table.
2. Click the **⋮** (actions) menu on the row you want to change.
3. Click **Enable maintenance mode** or **Disable maintenance mode**.

An amber **Maintenance** badge appears in the Status column while the host is in maintenance mode.

### Via the API

```http
POST /api/nginx/proxy-hosts/{id}/maintenance
Authorization: Bearer <token>
Content-Type: application/json

{"enabled": true}
```

### Via MCP

```
npm_set_maintenance(id=<id>, enabled=true)
```

## Custom page

By default NPM serves a built-in branded 503 page. You can replace it with your own HTML:

### Via the UI

1. Open the host's **Edit** modal → **Advanced** tab.
2. Scroll down to **Custom 503 Maintenance Page HTML**.
3. Paste your HTML and click **Save Maintenance Page**.

Empty the field and save again to revert to the built-in page.

### Via the API

```http
PUT /api/nginx/proxy-hosts/{id}/maintenance-page
Authorization: Bearer <token>
Content-Type: application/json

{"html": "<html>...your page...</html>"}
```

Pass an empty string for `html` to revert to the built-in page.

### Via MCP

```
npm_set_maintenance_page(id=<id>, html="<html>...</html>")
npm_get_maintenance_page(id=<id>)   # read current custom HTML
```

## File locations

| File | Purpose |
|---|---|
| `/data/nginx/maintenance/_default.html` | Built-in branded page (auto-created on first use) |
| `/data/nginx/maintenance/{id}.html` | Per-host custom page |
