#!/bin/sh
# Fix mounted data ownership before dropping to the app user.
set -eu

if [ "$(id -u)" = '0' ]; then
    chown -R stino:stino "${DATA_DIR:-/data}"
    exec setpriv --reuid stino --regid stino --init-groups "$@"
fi

exec "$@"
