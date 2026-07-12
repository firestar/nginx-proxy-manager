# Header Manipulation

Proxy hosts support per-host request and response header manipulation without needing raw nginx config.

## What it does

For each header rule you define, NPM emits one nginx directive inside the default `location /` block:

| Direction | Action | nginx directive |
|---|---|---|
| Request | Set | `proxy_set_header Name "Value";` |
| Request | Remove | `proxy_set_header Name "";` |
| Response | Set | `add_header Name "Value" always;` |
| Response | Remove | `proxy_hide_header Name;` |

## Adding headers

In the proxy host edit modal, open the **Headers** tab. Click **Add Header** to add a row. Each row has:

- **Direction** — `Request` (sent to upstream) or `Response` (sent to browser)
- **Action** — `Set` (inject/overwrite) or `Remove` (suppress)
- **Header Name** — must match `^[A-Za-z0-9-]+$`
- **Header Value** — required when action is Set

## Restrictions

The following headers cannot be set via this UI because they are managed by existing NPM toggles:

- `Host`
- `X-Forwarded-For` (use the Forwarding toggles)
- `X-Forwarded-Proto` (use the SSL / Trust Forwarded Proto toggle)

## Value safety

Header values are validated server-side. These are rejected:

- Values containing a double-quote character (`"`)
- Values containing newline (`\n`) or carriage-return (`\r`)
- Values ending with a semicolon (`;`) — use `; ` (trailing space) if needed

Semicolons that appear in the middle of a value are allowed, so HSTS-style values like `max-age=31536000; includeSubDomains` work correctly.

## Inheritance note

These directives are emitted at the `location /` level. Per-path custom locations inherit from the server block level, not the default location — which is the standard nginx behavior. If you need per-path headers, use the **Advanced Config** field inside a custom location.

## MCP / API

The `headers` field is available on the proxy host create and update API endpoints and MCP tools as an array:

```json
[
  { "direction": "request",  "action": "set",    "name": "X-Real-IP",    "value": "$remote_addr" },
  { "direction": "response", "action": "remove",  "name": "X-Powered-By", "value": "" }
]
```
