#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../shared/unix-provider-cli-common.sh
. "$SCRIPT_DIR/../shared/unix-provider-cli-common.sh"

run_native_provider_installer 'linux' 'kiro' "$@"
