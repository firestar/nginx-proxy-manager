#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Checking agent paths ...'

# Ensure /data is mounted
if [ ! -d '/data' ]; then
	log_fatal '/data is not mounted! Check your docker configuration.'
fi

# Create required folders
mkdir -p \
	/data/agent/snapshots \
	/data/custom_ssl \
	/data/logs \
	/data/access \
	/data/letsencrypt-acme-challenge \
	/etc/letsencrypt \
	/run/nginx \
	/tmp/nginx/body \
	/var/log/nginx \
	/var/lib/nginx/cache/public \
	/var/lib/nginx/cache/private \
	/var/cache/nginx/proxy_temp

# Initial empty snapshot + live symlink. nginx.conf includes
# /data/nginx/<type>/*.conf and /data/nginx always points at the active
# snapshot; the agent swaps this symlink atomically on config pushes.
if [ ! -d '/data/agent/snapshots/v0' ]; then
	mkdir -p \
		/data/agent/snapshots/v0/default_host \
		/data/agent/snapshots/v0/default_www \
		/data/agent/snapshots/v0/proxy_host \
		/data/agent/snapshots/v0/redirection_host \
		/data/agent/snapshots/v0/stream \
		/data/agent/snapshots/v0/dead_host \
		/data/agent/snapshots/v0/temp \
		/data/agent/snapshots/v0/custom
fi
if [ ! -L '/data/nginx' ]; then
	rm -rf /data/nginx
	ln -s /data/agent/snapshots/v0 /data/nginx
fi

touch /var/log/nginx/error.log || true
chmod 777 /var/log/nginx/error.log || true
chmod -R 777 /var/cache/nginx || true

log_info 'Setting ownership ...'
chown -R "$PUID:$PGID" \
	/data \
	/etc/letsencrypt \
	/run/nginx \
	/tmp/nginx \
	/var/cache/nginx \
	/var/lib/nginx \
	/var/log/nginx \
	/etc/nginx/conf.d
