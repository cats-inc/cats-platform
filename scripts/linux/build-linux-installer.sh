#!/usr/bin/env bash
#
# Script: build-linux-installer.sh
# Description: Build unsigned/test Linux desktop packages for Cats.
#
# Usage: ./scripts/linux/build-linux-installer.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"
node ./scripts/build-desktop-installer.mjs --target linux
