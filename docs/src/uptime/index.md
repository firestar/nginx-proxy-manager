# Upstream Uptime Checks & Public Status Page

NPM can actively probe each proxy host's upstream and expose the results on a public status page.

## How it works

- A background checker runs every **10 seconds** and probes each host whose `check_enabled` flag is set.
- Probes are a `HEAD` request to `{forward_scheme}://{forward_host}:{forward_port}{check_path}` with `Host: <first domain_name>` and a 10 s timeout. TLS verification is disabled (internal upstreams may use self-signed certs).
- **Flap protection**: 2 consecutive failures → status flips to `down`; 2 consecutive successes → flips back to `up`.
- On transition, an `uptime_event` row is written and a notification event fires (`upstream.down` / `upstream.up`).

## Configuring a proxy host

In the **Proxy Host modal → Uptime Check tab**:

| Field | Default | Description |
|-------|---------|-------------|
| Enable uptime checks | off | Activates probing for this host |
| Check path | `/` | HTTP path to probe |
| Check interval (seconds) | 60 | Minimum seconds between probes |
| Expected status | `200-399` | Accepted HTTP status: range (`200-399`), single (`200`), or comma-list (`200,301,404`) |

## Notification events

Enable the events in **Settings → Notifications** on any channel:

| Event | Fired when |
|-------|------------|
| `upstream.down` | 2 consecutive probe failures (upstream went down) |
| `upstream.up` | 2 consecutive probe successes after a down period (upstream recovered) |

## Uptime report API

Authenticated endpoint returning per-host status and uptime percentages:

```
GET /api/reports/uptime
```

Response:
```json
[
  {
    "id": 1,
    "domain_names": ["example.com"],
    "status": "up",
    "latency_ms": 42,
    "last_checked": "2026-07-12 10:00:00",
    "uptime": {
      "d1": 100.0,
      "d7": 99.8,
      "d90": 99.5
    }
  }
]
```

## MCP tool

- `npm_get_uptime` — returns the same data as `GET /api/reports/uptime`

## Public status page

### Setup

1. Go to **Settings → Status Page**.
2. Enable the page, set a slug (e.g. `my-services`) and a title.
3. Optionally filter which hosts appear by selecting a **tag** — only hosts with that tag and uptime checks enabled are shown. Leave blank to show all check-enabled hosts.
4. Save.

The page is then publicly accessible at `/status/<slug>` (no authentication required).

### Rate limiting

The public endpoint is rate-limited to **30 requests per 60 seconds per IP** to prevent abuse.

### Public API response

```
GET /api/status/<slug>
```

```json
{
  "title": "Service Status",
  "generated_on": "2026-07-12T10:00:00.000Z",
  "hosts": [
    {
      "name": "example.com",
      "status": "up",
      "uptime": { "d1": 100.0, "d7": 99.9, "d90": 99.7 }
    }
  ]
}
```

Sensitive fields (upstream host/port, error messages) are not exposed.

## Uptime percentage calculation

For a given window (24 h / 7 d / 90 d):

```
uptime % = (window_duration - total_downtime_in_window) / window_duration × 100
```

- Only `down` events that overlap the window are counted.
- Open events (no `ended_on`) are counted as ongoing until now.
- Result is clamped to `[0, 100]`.

## Database tables

| Table | Description |
|-------|-------------|
| `upstream_status` | One row per proxy host — current status, latency, last checked |
| `uptime_event` | Log of every up/down transition with start and end timestamps |

Columns added to `proxy_host`: `check_enabled`, `check_path`, `check_interval_s`, `expected_status`.
