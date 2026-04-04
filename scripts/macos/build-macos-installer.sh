#!/usr/bin/env bash
#
# Script: build-macos-installer.sh
# Description: Build unsigned/test macOS desktop packages for Cats.
#
# Usage: ./scripts/macos/build-macos-installer.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"
node ./scripts/build-desktop-installer.mjs --target macos
