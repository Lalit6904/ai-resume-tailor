#!/bin/sh
# Runs as root, prepares the private storage directory, then drops privileges to
# the unprivileged "node" user before starting the application.
#
# Render mounts persistent disks as root, so the image's `node` user cannot
# write to /app/storage (or any other mounted path) until ownership is handed
# over. Doing it here keeps the rest of the container running as `node`.

set -eu

if [ -n "${STORAGE_DIR:-}" ]; then
  mkdir -p "$STORAGE_DIR"
  chown -R node:node "$STORAGE_DIR" 2>/dev/null || true
fi

exec gosu node "$@"
