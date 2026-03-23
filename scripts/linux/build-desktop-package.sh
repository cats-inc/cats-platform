#!/usr/bin/env bash
#
# Script: build-desktop-package.sh
# Description: Build staged desktop packaging outputs for Cats.
#
# Usage: ./scripts/linux/build-desktop-package.sh [all|windows|macos|linux] [output-dir]
#
# Arguments:
#   [platform]    Optional platform filter. Defaults to all.
#   [output-dir]  Optional output directory override.
#
# Examples:
#   ./scripts/linux/build-desktop-package.sh linux
#   ./scripts/linux/build-desktop-package.sh all build/desktop-packaging-ci
#

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
PLATFORM="${1:-all}"
OUTPUT_DIR="${2:-}"

cd "${PROJECT_ROOT}"
npm run build
if [[ -n "${OUTPUT_DIR}" ]]; then
  node ./scripts/package-desktop.mjs --platform "${PLATFORM}" --output-dir "${OUTPUT_DIR}"
else
  node ./scripts/package-desktop.mjs --platform "${PLATFORM}"
fi
