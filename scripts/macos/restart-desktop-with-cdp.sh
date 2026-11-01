#!/bin/bash
# Restart installed Cats Desktop with CDP. Usage: restart-desktop-with-cdp.sh [--port 9222] [--app PATH] [--disable] [--force] [--help]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec /bin/bash "$SCRIPT_DIR/../shared/restart-electron-with-cdp.sh" "$@"
