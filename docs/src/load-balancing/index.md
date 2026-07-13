# Load Balancing

A proxy host can forward to **multiple upstream servers** instead of a single one. NPM renders an nginx `upstream` group and points the host's `proxy_pass` at it, so traffic is distributed across every server in the pool.

This is **Phase A: static load balancing with passive health checks**. Active, probe-driven failover is a planned follow-up (see [Uptime Checks](/uptime/) for the current active-probe feature, which is independent of load balancing).

## Enabling it

In the **Proxy Host modal → Details tab**, turn on the **Load Balancing** toggle. The single Forward Host/Port fields are replaced by an upstream editor:

- **Add upstream** adds a server row (host, port, weight, backup).
- **Method** selects the balancing algorithm.

Turning the toggle off restores single-target mode; the Forward Host/Port fields are preserved (they always mirror the primary upstream), so reverting is lossless.

## Upstream options

Each server in the pool supports:

| Option | Meaning |
|--------|---------|
| **host** / **port** | The upstream address. `host:port` pairs must be unique within the pool. |
| **weight** | Relative share of traffic (integer ≥ 1, default 1). A server with `weight=2` receives twice the requests of a `weight=1` server. |
| **backup** | The server only receives traffic when **all** non-backup servers are unavailable. A pool must contain at least one non-backup server. |
| **max_fails** | Passive health: number of failed connection attempts within `fail_timeout` before nginx marks the server unavailable (integer ≥ 0; `0` disables the check). Set via the API/MCP. |
| **fail_timeout** | Passive health: how long (seconds) a server stays marked unavailable after `max_fails` is reached. Set via the API/MCP. |

## Balance methods

| Method | Behaviour |
|--------|-----------|
| **Round robin** (default) | Requests are distributed in order, respecting weights. |
| **Least connections** (`least_conn`) | Each request goes to the server with the fewest active connections. |
| **IP hash** (`ip_hash`) | The client IP selects the server, giving sticky sessions per client. |

## Passive health checks

Phase A relies on nginx's built-in **passive** health checking. nginx observes real proxied traffic: when a server fails `max_fails` times within `fail_timeout`, it is taken out of rotation for `fail_timeout` seconds, then retried. There is no separate active probe that dials the upstream on a schedule — a server is only tested by live requests.

## Remote nodes

Load-balanced hosts work on [remote nodes](/multi-node/) with no agent changes: the same template renders the `upstream` block into the node's config snapshot. A host pinned to a node, or replicated across all nodes, load-balances exactly as it does locally.

## Generated config

For a host with two upstreams and `least_conn`, NPM emits roughly:

```nginx
upstream npm_1 {
  least_conn;
  server 10.0.0.2:8080 weight=2;
  server 10.0.0.3:8080 backup;
}

server {
  # ...
  location / {
    # ...
    proxy_pass http://npm_1;
  }
}
```

In single-target mode the config is unchanged from previous versions — the `upstream` block is omitted and the host proxies directly to Forward Host/Port.
