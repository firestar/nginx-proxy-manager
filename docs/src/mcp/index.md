---
outline: deep
---

# MCP Server

Nginx Proxy Manager ships a built-in [Model Context Protocol](https://modelcontextprotocol.io)
server, so AI assistants (Claude Code, Claude Desktop, or any MCP client) can manage your
proxy hosts, redirections, streams, certificates and access lists through natural language.

The MCP endpoint runs inside the normal backend process — there is nothing extra to start,
configure or expose. It lives on the same port as the admin interface:

```
http://<your-host>:81/api/mcp
```

Transport is Streamable HTTP (`POST`/`GET`/`DELETE` on that one path).

## Authentication

Clients authenticate with an NPM **API key**, sent as a Bearer token. Create one in the
admin UI under **API Keys** and pass it in the `Authorization` header:

```
Authorization: Bearer npm_xxxxxxxxxxxxxxxxxxxx
```

There are no separate MCP credentials. Every tool call the assistant makes is executed
against the API *as that key*, so all normal validation, user permissions and key scopes
apply. MCP sessions are pinned to the key that opened them — a session id cannot be reused
with a different or missing token.

::: warning Keys are powerful
An unrestricted API key can do everything its owning user can. For AI use, prefer a
[scoped key](#scopes) so the assistant only sees and touches what you intend.
:::

## Client configuration

For any MCP client that supports Streamable HTTP with custom headers:

```json
{
	"mcpServers": {
		"nginx-proxy-manager": {
			"type": "http",
			"url": "http://<your-host>:81/api/mcp",
			"headers": {
				"Authorization": "Bearer npm_xxxxxxxxxxxxxxxxxxxx"
			}
		}
	}
}
```

With the Claude Code CLI:

```bash
claude mcp add --transport http nginx-proxy-manager \
  http://<your-host>:81/api/mcp \
  --header "Authorization: Bearer npm_xxxxxxxxxxxxxxxxxxxx"
```

If your admin interface is served over HTTPS behind NPM itself, use that URL instead —
the endpoint follows the admin interface wherever it is reachable.

## Scopes

API keys can be restricted at creation time to a set of scopes of the form
`resource:level`, where the resources are `proxy_hosts`, `redirection_hosts`,
`dead_hosts`, `streams`, `access_lists` and `certificates`, and the levels are
`view` (read-only) or `manage` (full control, implies view).

Scopes affect the MCP server twice:

1. **Tool registration** — tools outside the key's scopes are never registered, so the
   assistant doesn't even see them. A key scoped to `proxy_hosts:view` gets
   `npm_list_proxy_hosts` and `npm_get_proxy_host`, and none of the create/update/delete
   tools.
2. **Enforcement** — every tool call is re-checked server-side against the key's scopes,
   so even a confused client cannot exceed them.

A scoped key also never acts as an admin: user management, settings changes and other
admin-only operations are denied regardless of the owning user's role. Keys created
without scopes ("Full access") behave like the owning user.

## Available tools

All tools are prefixed `npm_`. What a session actually exposes depends on the key's scopes.

| Group | Scope resource | Tools |
|---|---|---|
| Proxy Hosts | `proxy_hosts` | `list`, `get`, `create`, `update`, `delete`, `enable`, `disable` (`npm_*_proxy_host`) |
| Redirection Hosts | `redirection_hosts` | `list`, `get`, `create`, `update`, `delete`, `enable`, `disable` (`npm_*_redirection_host`) |
| 404 Hosts | `dead_hosts` | `list`, `get`, `create`, `update`, `delete`, `enable`, `disable` (`npm_*_dead_host`) |
| Streams | `streams` | `list`, `get`, `create`, `update`, `delete`, `enable`, `disable` (`npm_*_stream`) |
| Certificates | `certificates` | `npm_list_certificates`, `npm_get_certificate`, `npm_create_certificate`, `npm_renew_certificate`, `npm_delete_certificate`, `npm_list_dns_providers` |
| Access Lists | `access_lists` | `npm_list_access_lists`, `npm_get_access_list`, `npm_create_access_list`, `npm_update_access_list`, `npm_delete_access_list` |
| Tags | — | `npm_list_tags`, `npm_get_tag`, `npm_create_tag`, `npm_update_tag`, `npm_delete_tag` |
| Misc | — | `npm_get_current_user`, `npm_list_users`, `npm_get_user`, `npm_list_settings`, `npm_get_setting`, `npm_get_audit_log`, `npm_get_hosts_report` |

Tags and Misc tools are always registered, but their underlying API calls are still
subject to the key's permissions — e.g. `npm_list_users` fails for a scoped key.

::: tip API keys cannot manage API keys
By design, a key cannot create, reroll or revoke keys (including itself), so a leaked
key cannot mint replacements.
:::

## Example session

Asking an assistant *"list the proxies tagged mcbans"* results in:

1. `npm_list_tags` — find the tag id for `mcbans`
2. `npm_list_proxy_hosts` with `expand: tags` — fetch hosts with their tags
3. The assistant filters and presents the matching hosts

Destructive tools (`delete`) are annotated as such, and well-behaved clients will ask
for confirmation before invoking them.

## Standalone server

The repository also contains `mcp/`, a standalone Node package that provides the same
tools as a separate process talking to the NPM API over HTTP. It predates the built-in
endpoint and remains useful if you want to run the MCP server on a different machine
than NPM itself. For everything else, prefer the built-in `/api/mcp` endpoint — fewer
moving parts and no stored credentials. See `mcp/README.md` for its configuration.
