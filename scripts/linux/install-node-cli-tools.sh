#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../shared/unix-node-cli-common.sh
. "$SCRIPT_DIR/../shared/unix-node-cli-common.sh"

run_node_cli_pack 'linux' "$@"
