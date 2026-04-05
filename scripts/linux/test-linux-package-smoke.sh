#!/usr/bin/env bash
#
# Script: test-linux-package-smoke.sh
# Description: Validate an unpacked Linux Cats desktop package.
#
# Usage: ./scripts/linux/test-linux-package-smoke.sh [release-root]
#

set -euo pipefail

RELEASE_ROOT="${1:-release/linux-unpacked}"
RESOURCES_ROOT="${RELEASE_ROOT}/resources"
PLAN_PATH="${RESOURCES_ROOT}/desktop-package-plan.json"

log() {
  printf '[smoke] %s\n' "$1"
}

pass() {
  printf '[pass] %s\n' "$1"
}

assert_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "${path}" ]]; then
    printf 'Missing %s at %s\n' "${label}" "${path}" >&2
    exit 1
  fi
  pass "${label} found at ${path}"
}

log "Validating Linux unpacked package under ${RELEASE_ROOT}"

assert_file "${RESOURCES_ROOT}/app-sidecar/build/server/index.js" 'bundled cats server entry'
assert_file "${RESOURCES_ROOT}/app-sidecar/build/renderer/index.html" 'bundled cats renderer build'
assert_file "${RESOURCES_ROOT}/app-sidecar/package.json" 'bundled cats app package manifest'
assert_file "${RESOURCES_ROOT}/cats-runtime/dist/index.js" 'bundled cats-runtime entry'
assert_file "${RESOURCES_ROOT}/cats-runtime/package.json" 'bundled cats-runtime package manifest'
assert_file "${RESOURCES_ROOT}/cats-runtime/public/provider-setup.html" 'bundled cats-runtime setup UI'
assert_file "${RESOURCES_ROOT}/cats-runtime/skills/README.md" 'bundled cats-runtime skills catalog root'
assert_file "${RESOURCES_ROOT}/cats-runtime/config/providers.yaml.example" 'bundled cats-runtime provider config example'
assert_file "${RESOURCES_ROOT}/cats-runtime/node_modules/yaml/package.json" 'bundled cats-runtime dependency marker'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/setup-node-global-prefix.sh" 'bundled Linux npm prefix helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/install-node-cli-tools.sh" 'bundled Linux node CLI pack helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/install-claude-code.sh" 'bundled Linux Claude Code installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/install-cursor-agent.sh" 'bundled Linux Cursor Agent installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/install-goose.sh" 'bundled Linux Goose installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/install-junie.sh" 'bundled Linux Junie installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/install-kiro-cli.sh" 'bundled Linux Kiro installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/linux/check-installation.sh" 'bundled Linux readiness audit helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/shared/unix-provider-cli-common.sh" 'bundled shared Unix provider helper library'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/shared/unix-node-cli-common.sh" 'bundled shared Unix npm helper library'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/manifest.json" 'bundled setup-assets manifest'
assert_file "${PLAN_PATH}" 'bundled desktop packaging plan'

node - <<'NODE' "${PLAN_PATH}"
const fs = require('node:fs');

const [planPath] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const linuxTarget = Array.isArray(plan.targets)
  ? plan.targets.find((target) => target.platform === 'linux')
  : null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(plan.strategy === 'electron-sidecar-bundle', 'installer packaging strategy is electron-sidecar-bundle');
assert(plan.selfHostedNpmCompatible === true, 'installer keeps self-hosted npm compatibility');
assert(Boolean(linuxTarget), 'installer packaging plan includes a Linux target');
assert(linuxTarget.installerFormats.includes('appimage'), 'Linux target includes AppImage packaging');
assert(linuxTarget.installerFormats.includes('deb'), 'Linux target includes deb packaging');
assert(linuxTarget.artifacts.some((artifact) => artifact.id === 'linux-node-cli-pack-script'), 'Linux target includes the bundled node CLI pack asset');
assert(linuxTarget.artifacts.some((artifact) => artifact.id === 'linux-setup-readiness-audit-script'), 'Linux target includes the bundled readiness audit asset');
assert(linuxTarget.artifacts.some((artifact) => artifact.id === 'unix-provider-cli-common-support-script'), 'Linux target includes the shared Unix provider helper asset');
assert(plan.installer.providerSetup.localProviders.some((provider) => provider.id === 'kiro' && provider.platform === 'linux'), 'installer contract keeps Kiro in the Linux bundled local-provider rollout');
assert(plan.installer.providerSetup.helperCatalog.some((helper) => helper.id === 'linux-install-readiness-audit'), 'installer contract includes Linux readiness helper metadata');
assert(!plan.installer.providerSetup.helperCatalog.some((helper) => helper.id === 'windows-install-readiness-audit'), 'installer contract omits Windows-only helper metadata from the Linux package');
NODE

pass 'Linux unpacked package smoke-check completed successfully'
