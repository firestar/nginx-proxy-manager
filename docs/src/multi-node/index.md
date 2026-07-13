# Multi-Node

Run nginx on multiple servers, all managed from one panel. The panel keeps the
database, the UI and certificate issuance; each remote server runs a slim
**npm-agent** container that receives rendered nginx configuration over an
outbound WebSocket and applies it safely.

## How it works

- The agent dials **out** to the panel (`wss://panel/api/agents/ws`), so remote
  nodes behind NAT or firewalls work without any inbound ports.
- The panel renders the nginx config for every host assigned to a node — plus
  the certificate and access-list files those configs reference — into a
  **versioned snapshot** and pushes it on any change. A full sync also happens
  every time the agent connects.
- The agent stages each snapshot into `/data/agent/snapshots/v<N>`, atomically
  repoints the `/data/nginx` symlink at it, and runs `nginx -t`:
  - **Test passes:** nginx is reloaded and the agent acks `ok`.
  - **Test fails:** the symlink is swapped back to the previous snapshot (the
    running nginx was never reloaded, so traffic is unaffected), and the agent
    acks the error. The panel stores it on the node and fires the
    `node.config_failed` notification event.
- The agent heartbeats every 30 seconds. After 3 missed heartbeats (or a
  dropped connection) the node is marked **offline** and the `node.offline`
  event fires; `node.online` fires on recovery.

## Enrolling a node

1. In the panel go to **Nodes** and add a node. You get a **one-time
   enrollment token** and a ready-made `docker run` command with the panel
   address pre-filled from the page's domain:

   ```bash
   docker run -d --name npm-agent --restart unless-stopped \
     -p 80:80 -p 443:443 \
     -v npm-agent-data:/data \
     -e PANEL_URL="wss://panel.example.com" \
     -e AGENT_TOKEN="npma_..." \
     panel.kaiad.dev/npm-agent:latest
   ```

2. On first connect the agent exchanges the token for a per-node key (only a
   hash is stored on the panel) and saves it in `/data/agent/credentials.json`.
   The token cannot be used again; if an agent is lost, use **Regenerate
   Token** on the node and start a fresh agent with it.
3. Config bundles are HMAC-SHA256 signed with a per-node secret issued at
   enrollment, on top of TLS and key authentication.

### Agent environment variables

| Variable           | Default       | Description                                            |
| ------------------ | ------------- | ------------------------------------------------------ |
| `PANEL_URL`        | *(required)*  | Panel address, e.g. `wss://panel.example.com`          |
| `AGENT_TOKEN`      |               | One-time enrollment token (first start only)           |
| `AGENT_TLS_VERIFY` | `true`        | Set `false` to accept self-signed panel certificates   |
| `AGENT_DATA_DIR`   | `/data/agent` | Where snapshots and credentials are stored             |

## Assigning hosts to a node

Every proxy host, redirection host, 404 host and stream has a **Node**
selector (default: *Local*, the panel's own nginx). Pick an enrolled node and
save — the config applies on that node within seconds and the host tables show
Every proxy host, redirection host, 404 host and stream has a **Node**
selector with three kinds of target:

- **Local** (default) — the panel's own nginx.
- A specific enrolled node — the host is served from that one node.
- **All nodes (HA)** — the host is replicated to *every* enrolled node (see
  [High availability](#high-availability-replicate-to-all) below).

Pick a target and save; the config applies within seconds and the host tables
show which node(s) serve each host, with a per-node apply-state chip for
replicated hosts.

### Certificates on remote nodes

Certificates are always issued centrally by the panel, but HTTP-01 challenges
are answered by the panel's nginx. Two options make certs work on remote nodes:

1. **DNS-challenge (or custom) certificates** always work — no challenge needs
   to reach the node. This is the simplest option and needs no extra setup.
2. **HTTP-01 via the ACME relay.** Set **Settings → High Availability → ACME
   Relay URL** to the panel's public HTTP address (e.g.
   `http://panel.example.com`). The panel then templates a small relay location
   into every remote-node host config:

   ```nginx
   location ^~ /.well-known/acme-challenge/ {
     proxy_pass http://panel.example.com;   # the acme-relay-url setting
     proxy_set_header Host $host;
   }
   ```

   When you request an HTTP-01 certificate for a host on a remote node, the
   panel first pushes the host (with the relay) to that node and waits for the
   agent to apply it, then runs certbot. Let's Encrypt hits the domain — which
   resolves to the remote node — the node relays the challenge back to the
   panel, and the panel answers it. Renewals work the same way.

With **no** relay configured, selecting an HTTP-01 certificate (or requesting a
new one) for a remote host is rejected with an explanatory error pointing at
the setting.

## High availability (replicate-to-all)

Setting a host's node to **All nodes (HA)** pushes identical config to every
enrolled node. Combined with an external load balancer or DNS round-robin in
front of the nodes, this gives an active-active HA setup:

```
            ┌─────────────┐
  clients → │  LB / DNS   │ → node A (npm-agent)  ┐
            │ round-robin │ → node B (npm-agent)  � identical config
            └─────────────┘                       ┘
                                  ▲
                                  │ config push (WebSocket)
                             ┌────┴────┐
                             │  panel  │  DB · UI · certs
                             └─────────┘
```

**Deployment:**

1. Enroll two (or more) nodes, each running `npm-agent` and serving on
   `:80`/`:443` on its own host.
2. Put an external L4/L7 load balancer, or DNS round-robin / multiple A
   records, in front of the node addresses for each domain.
3. Set the relevant hosts' node to **All nodes (HA)**. If you use HTTP-01
   certificates, configure the **ACME Relay URL** first (above).

**Failure semantics — degraded, not down:** each node applies independently.
One node failing `nginx -t` does **not** block the others — its error is stored
per node (`meta.node_status`) and the `node.config_failed` event fires with the
node's name, while the healthy nodes keep serving the new config. The host row
and the **Nodes → Per-Host Sync Matrix** show the aggregate as the worst state
across nodes, so a partial failure reads as *degraded*. If a whole node dies,
the LB routes around it and the panel marks it **offline** (`node.offline`);
the surviving nodes continue serving.

## Notifications
## Remote metrics and uptime

Once a node is enrolled, the panel automatically collects traffic metrics and
uptime data from it.

**Metrics** — each agent tails the nginx access log locally, aggregates
request counts and byte totals into one-minute buckets, and ships them to the
panel every 30 seconds. The panel stores them alongside local metrics and rolls
them up using the same 48 h → hourly retention policy. The Nodes page shows a
**Req Rate** (requests per minute over the last 15 minutes) and a **Last
Metric** timestamp for each node so you can see at a glance that data is
flowing.

**Uptime checks** — hosts that have uptime monitoring enabled and are assigned
to a remote node are probed by the agent itself (not the panel), using the same
HTTP HEAD check, expected-status and interval settings. The agent sends each
probe result back to the panel, which applies the same flap-detection logic
(two consecutive failures / recoveries) and fires `host.offline` /
`host.online` notification events. This means uptime is measured from the
node's network perspective, not the panel's.

## Building the agent image

```bash
docker build -f docker/Dockerfile.agent -t npm-agent .
```

For local development, `docker/docker-compose.dev.yml` contains an `agent`
service wired to the dev panel (`AGENT_TOKEN` is read from the environment).


### Agent image from the Kaiad registry

The `npm-agent` Kaiad pipeline builds the agent image and publishes it to
the Kaiad built-in OCI registry as `<panel-host>/npm-agent:<sha>`. Before a
remote host can `docker pull` that image it must authenticate:

```bash
docker login <panel-host>
```

Use a registry.pull-scoped API credential or an enrollment token as the
password (see [Kaiad registry docs](https://kaiad.dev/reference/registry.html)).

The panel's `AGENT_IMAGE` environment variable controls the image reference
shown in the enrollment `docker run` command. It defaults to
`panel.kaiad.dev/npm-agent:latest`; set it to `<panel-host>/npm-agent:<sha>`
to pin enrolling nodes to a specific Kaiad-built image.

## Limitations

- HTTP-01 certificates on remote nodes require the ACME Relay URL to be set; a
  node must be reachable at that domain for the challenge to complete.
- The per-node metrics breakdown on the proxy-host metrics chart requires the
  `?breakdown=1` query parameter and is not yet exposed in the UI.
