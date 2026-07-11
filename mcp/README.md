# Nginx Proxy Manager — MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI
assistant (Claude, or any MCP client) manage a running **Nginx Proxy Manager (NPM)**
instance: create and edit proxy hosts, redirections, 404 hosts, TCP/UDP streams,

> **Note:** NPM now serves this MCP server **built-in** at `/api/mcp` on the admin
> port — no separate process, authenticated directly with an NPM API key. Prefer
> that unless you need to run the MCP server on a different machine than NPM.
> See `docs/src/mcp/index.md` for the built-in endpoint's documentation.
SSL certificates and access lists.

It talks to NPM's existing REST API — it does **not** modify NPM itself. Run it
alongside your NPM instance and point it at NPM's API.

- **Transport:** Streamable HTTP (`POST/GET/DELETE /mcp`)
- **Auth to NPM:** an NPM API key (recommended), or login credentials with JWT auto-refresh
- **Language:** TypeScript, official `@modelcontextprotocol/sdk`

## Requirements

- Node.js 18+
- A reachable NPM instance, plus either an API key (created in the NPM UI under
  **API Keys**) or a user account **without 2FA** (credential login cannot answer
  a 2FA challenge). API keys work regardless of 2FA.

## Setup

```bash
cd mcp
npm install
cp .env.example .env   # then edit .env
npm run build
npm start
```

### Configuration (`.env` or real env vars)

| Variable | Required | Default | Description |
| `NPM_BASE_URL` | yes | — | NPM API base URL, including `/api`. Usually the admin UI host on port 81, e.g. `http://localhost:81/api` |
| `NPM_API_KEY` | no* | — | NPM API key (`npm_...`), created in the NPM UI under **API Keys**. Recommended; when set, identity/secret are ignored |
| `NPM_IDENTITY` | no* | — | NPM login email (account without 2FA) |
| `NPM_SECRET` | no* | — | NPM login password |
| `MCP_PORT` | no | `3001` | Port the MCP HTTP endpoint listens on |
| `MCP_HOST` | no | `127.0.0.1` | Bind interface. Keep local unless you also set `MCP_AUTH_TOKEN` |
| `MCP_AUTH_TOKEN` | no | _(none)_ | If set, clients must send `Authorization: Bearer <token>` to reach `/mcp` |
| `NPM_TLS_REJECT_UNAUTHORIZED` | no | `true` | Set to `false` to allow self-signed certs when `NPM_BASE_URL` is https |

\* Either `NPM_API_KEY`, or both `NPM_IDENTITY` and `NPM_SECRET`, must be set.
API keys can be revoked or rerolled from the NPM UI at any time without
restarting NPM — reroll invalidates the old secret immediately.

On startup the server verifies it can authenticate with NPM and exits with a clear
message if it can't.

## Connecting a client

The endpoint is `http://<MCP_HOST>:<MCP_PORT>/mcp`. Example for a client that
supports Streamable HTTP MCP servers:

```json
{
  "mcpServers": {
    "nginx-proxy-manager": {
      "type": "http",
      "url": "http://127.0.0.1:3001/mcp"
    }
  }
}
```

If you set `MCP_AUTH_TOKEN`, add:

```json
"headers": { "Authorization": "Bearer <your-token>" }
```

## Tools

All tools are prefixed `npm_`. Read-only tools are marked as such; create/update/
delete tools change live configuration.

**Proxy hosts:** `npm_list_proxy_hosts`, `npm_get_proxy_host`, `npm_create_proxy_host`,
`npm_update_proxy_host`, `npm_delete_proxy_host`, `npm_enable_proxy_host`,
`npm_disable_proxy_host`

**Redirection hosts:** `npm_list_redirection_hosts`, `npm_get_redirection_host`,
`npm_create_redirection_host`, `npm_update_redirection_host`,
`npm_delete_redirection_host`, `npm_enable_redirection_host`,
`npm_disable_redirection_host`

**404 hosts:** `npm_list_404_hosts`, `npm_get_404_host`, `npm_create_404_host`,
`npm_update_404_host`, `npm_delete_404_host`, `npm_enable_404_host`,
`npm_disable_404_host`

**Streams:** `npm_list_streams`, `npm_get_stream`, `npm_create_stream`,
`npm_update_stream`, `npm_delete_stream`, `npm_enable_stream`, `npm_disable_stream`

**Certificates:** `npm_list_certificates`, `npm_get_certificate`,
`npm_list_dns_providers`, `npm_create_certificate`, `npm_renew_certificate`,
`npm_delete_certificate`

**Access lists:** `npm_list_access_lists`, `npm_get_access_list`,
`npm_create_access_list`, `npm_update_access_list`, `npm_delete_access_list`

**Tags:** `npm_list_tags`, `npm_get_tag`, `npm_create_tag`, `npm_update_tag`,
`npm_delete_tag`. Tags (name, color, icon) organize hosts across types; attach them by passing
`tag_ids` when creating/updating any host, and read them back with `expand: "tags"`
on the host list tools.

**Read-only:** `npm_get_current_user`, `npm_list_users`, `npm_get_user`,
`npm_list_settings`, `npm_get_setting`, `npm_get_audit_log`, `npm_get_hosts_report`

## Running with Docker Compose

Add a service next to your NPM container. Because `NPM_BASE_URL` points at NPM's
internal port (`81`), the MCP server can reach it over the compose network:

```yaml
services:
  app:
    image: 'docker.io/jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt

  npm-mcp:
    build: ./mcp
    restart: unless-stopped
    environment:
      NPM_BASE_URL: 'http://app:81/api'
      NPM_API_KEY: 'npm_your-api-key-here'
      MCP_HOST: '0.0.0.0'
      MCP_PORT: '3001'
      MCP_AUTH_TOKEN: 'set-a-strong-token'
    ports:
      - '3001:3001'
    depends_on:
      - app
```

A matching `Dockerfile` is included in this directory.

## Development

```bash
npm run dev     # tsc --watch
```

## Security notes

- The server holds NPM admin credentials — treat its host/env as sensitive.
  Prefer an API key over login credentials: it can be revoked or rerolled from
  the NPM UI the moment you suspect a leak.
- Bind to `127.0.0.1` for local use, or set `MCP_AUTH_TOKEN` and put it behind TLS
  if exposed on a network.
- Delete tools are irreversible; the tools advertise `destructiveHint` so clients
  can prompt for confirmation.
