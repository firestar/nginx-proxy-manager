# Notifications

Nginx Proxy Manager can push alerts to external services when key events occur.

## Supported channels

| Type | Description |
|------|-------------|
| `webhook` | Generic JSON POST to any URL |
| `slack` | Slack Block Kit message |
| `discord` | Discord embed via webhook |
| `telegram` | Telegram Bot API `sendMessage` |
| `ntfy` | [ntfy.sh](https://ntfy.sh) push notification |
| `email` | SMTP email (requires SMTP setting) |

## Events

| Event | Fired when |
|-------|------------|
| `host.offline` | A host config fails the nginx test (goes from online → offline) |
| `host.online` | A host config recovers (goes from offline → online) |
| `certificate.expiring` | A Let's Encrypt cert has ≤ 30 days until expiry (at most once/day per cert) |
| `certificate.renewal_failed` | Certbot renewal fails for a cert |
| `upstream.down` | Upstream probe: 2 consecutive failures (host is unreachable) |
| `upstream.up` | Upstream probe: recovered after being down |

## Managing channels

Go to **Settings → Notifications** in the UI, or use the API / MCP tools.

### API endpoints (admin-only)

```
GET    /api/notifications/channels
POST   /api/notifications/channels
GET    /api/notifications/channels/:id
PUT    /api/notifications/channels/:id
DELETE /api/notifications/channels/:id
POST   /api/notifications/channels/:id/test   ← sends a test host.offline event
GET    /api/notifications/logs                 ← recent delivery log
```

### MCP tools

- `npm_list_notification_channels`
- `npm_create_notification_channel`
- `npm_update_notification_channel`
- `npm_delete_notification_channel`
- `npm_test_notification_channel`
- `npm_list_notification_logs`

## Channel config reference

### webhook
```json
{ "url": "https://example.com/webhook" }
```

### slack
```json
{ "url": "https://hooks.slack.com/services/..." }
```

### discord
```json
{ "url": "https://discord.com/api/webhooks/..." }
```

### telegram
```json
{ "bot_token": "123456:ABC...", "chat_id": "-100..." }
```

### ntfy
```json
{ "url": "https://ntfy.sh", "topic": "nginx-proxy-manager" }
```
`url` defaults to `https://ntfy.sh` if omitted.

### email
```json
{ "to": "admin@example.com" }
```
Requires SMTP to be configured in **Settings → Notifications → SMTP** (stored as the `smtp` setting row).

## SMTP configuration

Update the `smtp` setting via **Settings → Default Site** (temporarily) or directly via:

```
PUT /api/settings/smtp
{
  "value": "enabled",
  "meta": {
    "host": "smtp.example.com",
    "port": 587,
    "secure": false,
    "user": "notify@example.com",
    "pass": "secret",
    "from": "NPM Alerts <notify@example.com>"
  }
}
```

> **Note:** SMTP credentials are stored as plaintext in the settings table, consistent with how DNS provider credentials are stored.

## Deduplication

| Event | Window |
|-------|--------|
| `host.offline` / `host.online` | 1 hour — won't re-alert for the same host within 1 h |
| `certificate.expiring` | 23 hours — at most one alert per cert per day while it's within 30 days |
| `certificate.renewal_failed` | 1 hour |

## Delivery retry

Each notification attempt retries up to 3 times with exponential backoff (1 s, 2 s, 4 s). Delivery result is written to `notification_log` regardless of outcome.
