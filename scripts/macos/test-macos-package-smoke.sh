#!/usr/bin/env bash
#
# Script: test-macos-package-smoke.sh
# Description: Validate an unpacked macOS Cats desktop package.
#
# Usage: ./scripts/macos/test-macos-package-smoke.sh [app-root]
#

set -euo pipefail

APP_ROOT="${1:-release/mac-universal/Cats.app}"
RESOURCES_ROOT="${APP_ROOT}/Contents/Resources"
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

log "Validating macOS app bundle under ${APP_ROOT}"

assert_file "${RESOURCES_ROOT}/app-sidecar/build/server/index.js" 'bundled cats server entry'
assert_file "${RESOURCES_ROOT}/app-sidecar/build/renderer/index.html" 'bundled cats renderer build'
assert_file "${RESOURCES_ROOT}/app-sidecar/package.json" 'bundled cats app package manifest'
assert_file "${RESOURCES_ROOT}/cats-runtime/build/runtime/index.js" 'bundled cats-runtime entry'
assert_file "${RESOURCES_ROOT}/cats-runtime/package.json" 'bundled cats-runtime package manifest'
assert_file "${RESOURCES_ROOT}/cats-runtime/public/provider-setup.html" 'bundled cats-runtime setup UI'
assert_file "${RESOURCES_ROOT}/cats-runtime/skills/README.md" 'bundled cats-runtime skills catalog root'
assert_file "${RESOURCES_ROOT}/cats-runtime/config/providers.yaml.example" 'bundled cats-runtime provider config example'
assert_file "${RESOURCES_ROOT}/cats-runtime/node_modules/yaml/package.json" 'bundled cats-runtime dependency marker'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/setup-node-global-prefix.sh" 'bundled macOS npm prefix helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/install-node-cli-tools.sh" 'bundled macOS node CLI pack helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/install-claude-code.sh" 'bundled macOS Claude Code installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/install-cursor-agent.sh" 'bundled macOS Cursor Agent installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/install-goose.sh" 'bundled macOS Goose installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/install-junie.sh" 'bundled macOS Junie installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/install-kiro-cli.sh" 'bundled macOS Kiro installer helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/macos/check-installation.sh" 'bundled macOS readiness audit helper'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/shared/unix-provider-cli-common.sh" 'bundled shared Unix provider helper library'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/shared/unix-node-cli-common.sh" 'bundled shared Unix npm helper library'
assert_file "${RESOURCES_ROOT}/desktop/setup-assets/manifest.json" 'bundled setup-assets manifest'
assert_file "${PLAN_PATH}" 'bundled desktop packaging plan'

node - <<'NODE' "${PLAN_PATH}"
const fs = require('node:fs');

const [planPath] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const macTarget = Array.isArray(plan.targets)
  ? plan.targets.find((target) => target.platform === 'macos')
  : null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(plan.strategy === 'electron-sidecar-bundle', 'installer packaging strategy is electron-sidecar-bundle');
assert(plan.selfHostedNpmCompatible === true, 'installer keeps self-hosted npm compatibility');
assert(Boolean(macTarget), 'installer packaging plan includes a macOS target');
assert(macTarget.installerFormats.includes('dmg'), 'macOS target includes dmg packaging');
assert(macTarget.installerFormats.includes('pkg'), 'macOS target includes pkg packaging');
assert(macTarget.artifacts.some((artifact) => artifact.id === 'macos-node-cli-pack-script'), 'macOS target includes the bundled node CLI pack asset');
assert(macTarget.artifacts.some((artifact) => artifact.id === 'macos-setup-readiness-audit-script'), 'macOS target includes the bundled readiness audit asset');
assert(macTarget.artifacts.some((artifact) => artifact.id === 'unix-node-cli-common-support-script'), 'macOS target includes the shared Unix npm helper asset');
assert(plan.installer.providerSetup.localProviders.some((provider) => provider.id === 'kiro' && provider.platform === 'macos'), 'installer contract keeps Kiro in the macOS bundled local-provider rollout');
assert(plan.installer.providerSetup.helperCatalog.some((helper) => helper.id === 'macos-install-readiness-audit'), 'installer contract includes macOS readiness helper metadata');
assert(!plan.installer.providerSetup.helperCatalog.some((helper) => helper.id === 'windows-install-readiness-audit'), 'installer contract omits Windows-only helper metadata from the macOS package');
NODE

pass 'macOS unpacked package smoke-check completed successfully'
