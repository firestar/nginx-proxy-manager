#!/command/with-contenv bash
# shellcheck shell=bash

# Agent variant of the prepare bundle: reuses the shared usergroup and
# dynamic-resolvers steps, replaces the panel paths/ownership steps with
# 21-agent-paths.sh (snapshot dirs + live symlink).

set -e

. /usr/bin/common.sh

if [ "$(id -u)" != "0" ]; then
	log_fatal "This docker container must be run as root, do not specify a user.\nYou can specify PUID and PGID env vars to run processes as that user and group after initialization."
fi

if [ "$DEBUG" = "true" ]; then
	set -x
fi

. /etc/s6-overlay/s6-rc.d/prepare/10-usergroup.sh
. /etc/s6-overlay/s6-rc.d/prepare/21-agent-paths.sh
. /etc/s6-overlay/s6-rc.d/prepare/40-dynamic.sh
