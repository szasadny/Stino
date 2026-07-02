#!/bin/sh
# Start as root only long enough to make the mounted data dir writable, then
# drop to the app user. A bind mount keeps the HOST's ownership — Docker even
# auto-creates a missing ./data as root:root — so the image-layer chown can't
# guarantee /data is writable (and data written by an older root-running image
# stays root-owned). Fixing it here at every start is what keeps an upgrade
# from crash-looping on its own database.
set -eu

if [ "$(id -u)" = '0' ]; then
    chown -R stino:stino "${DATA_DIR:-/data}"
    exec setpriv --reuid stino --regid stino --init-groups "$@"
fi

exec "$@"
