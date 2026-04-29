#!/usr/bin/env bash
#
# Packaged Cats macOS host helper: install or upgrade GitHub CLI (gh).
#
# Implements the packaged-helper contract used by Settings>Runtime:
#   --check / --apply / -upgrade / -force / --json
# Uninstall is intentionally omitted — gh is generally safe to remove
# but the helper keeps the surface symmetric with install-node.sh so
# Settings>Runtime never offers an uninstall path that nukes a
# machine-wide tool the user may rely on outside Cats.
#
# Uses Homebrew when available; falls back to a user-local binary
# install from the official GitHub Releases tarball into ~/.local/bin.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HELPER_ID='macos-github-cli-installer'
DISPLAY_NAME='GitHub CLI'
PLATFORM='darwin'
ARCH_DEFAULT='amd64'

mode='check'
emit_json='false'
install_state='auto'
detected_version_override=''
skip_gh_probe='false'

print_help() {
  cat <<EOF
Usage: install-github-cli.sh [--check] [--apply] [-upgrade] [-force] [--json]
                              [--install-state auto|installed|missing] [--detected-version <ver>]
                              [--skip-gh-probe]
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --check) mode='check' ;;
    --apply) mode='apply' ;;
    -upgrade) mode='upgrade' ;;
    -force) mode='force' ;;
    --json) emit_json='true' ;;
    --install-state)
      shift; install_state="${1:-auto}"
      ;;
    --detected-version)
      shift; detected_version_override="${1:-}"
      ;;
    --skip-gh-probe) skip_gh_probe='true' ;;
    -h|--help) print_help; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; print_help >&2; exit 1 ;;
  esac
  shift
done

declare -a planned_actions=()
declare -a applied_changes=()
declare -a warnings=()
declare -a manual_steps=()

resolve_gh_path() {
  command -v gh 2>/dev/null || true
}

resolve_gh_version() {
  if [ -n "$detected_version_override" ]; then
    printf '%s' "$detected_version_override"
    return
  fi
  if [ "$skip_gh_probe" = 'true' ]; then
    return
  fi
  local raw
  raw="$(gh --version 2>/dev/null | head -n 1 || true)"
  printf '%s' "$raw" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1
}

is_gh_installed() {
  case "$install_state" in
    installed) return 0 ;;
    missing) return 1 ;;
  esac
  if [ "$skip_gh_probe" = 'true' ]; then
    return 1
  fi
  command -v gh >/dev/null 2>&1
}

emit_result() {
  local status="$1"
  local installed="$2"
  local exit_code="$3"

  local cmd_path detected
  cmd_path="$(resolve_gh_path)"
  detected="$(resolve_gh_version)"

  json_array_from_lines() {
    local arr_name="$1[@]"
    local items=("${!arr_name:-}")
    local out='['
    local sep=''
    for item in "${items[@]:-}"; do
      [ -z "$item" ] && continue
      local escaped
      escaped="$(printf '%s' "$item" | sed 's/\\/\\\\/g; s/"/\\"/g')"
      out="$out$sep\"$escaped\""
      sep=','
    done
    out="$out]"
    printf '%s' "$out"
  }

  if [ "$emit_json" = 'true' ]; then
    cat <<JSON
{
  "helper": "$HELPER_ID",
  "displayName": "$DISPLAY_NAME",
  "mode": "$mode",
  "status": "$status",
  "installed": $installed,
  "commandPath": "$cmd_path",
  "detectedVersion": "$detected",
  "plannedActions": $(json_array_from_lines planned_actions),
  "appliedChanges": $(json_array_from_lines applied_changes),
  "warnings": $(json_array_from_lines warnings),
  "manualSteps": $(json_array_from_lines manual_steps),
  "interruptions": []
}
JSON
  else
    printf 'Helper: %s\n' "$HELPER_ID"
    printf 'Mode: %s\n' "$mode"
    printf 'Status: %s\n' "$status"
    printf 'Installed: %s\n' "$installed"
    [ -n "$detected" ] && printf 'Detected version: %s\n' "$detected"
    for w in "${warnings[@]:-}"; do
      [ -n "$w" ] && printf 'Warning: %s\n' "$w" >&2
    done
  fi

  exit "$exit_code"
}

# Mode: check
if [ "$mode" = 'check' ]; then
  if is_gh_installed; then
    emit_result 'ready' 'true' 0
  else
    planned_actions+=('install_github_cli')
    emit_result 'changes_required' 'false' 0
  fi
fi

# Mode: apply (idempotent)
if [ "$mode" = 'apply' ] && is_gh_installed; then
  emit_result 'ready' 'true' 0
fi

# Mutation modes
install_via_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    return 1
  fi
  case "$mode" in
    upgrade)
      if brew upgrade gh >/dev/null 2>&1 || brew install gh >/dev/null 2>&1; then
        applied_changes+=('brew_upgrade_gh')
        return 0
      fi
      ;;
    force)
      brew uninstall --force gh >/dev/null 2>&1 || true
      if brew install gh >/dev/null 2>&1; then
        applied_changes+=('brew_force_install_gh')
        return 0
      fi
      ;;
    *)
      if brew install gh >/dev/null 2>&1; then
        applied_changes+=('brew_install_gh')
        return 0
      fi
      ;;
  esac
  return 1
}

install_via_release_tarball() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    arm64|aarch64) arch='arm64' ;;
    x86_64|amd64) arch='amd64' ;;
    *) arch="$ARCH_DEFAULT" ;;
  esac

  local api_url='https://api.github.com/repos/cli/cli/releases/latest'
  local tag download_url tmp_dir
  if ! tag="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api_url" | grep -m 1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"; then
    warnings+=('Failed to query GitHub Releases API.')
    return 1
  fi
  if [ -z "$tag" ]; then
    warnings+=('Empty tag from GitHub Releases API.')
    return 1
  fi

  local version="${tag#v}"
  download_url="https://github.com/cli/cli/releases/download/${tag}/gh_${version}_${PLATFORM}_${arch}.tar.gz"
  tmp_dir="$(mktemp -d)"
  if ! curl -fsSL -o "$tmp_dir/gh.tar.gz" "$download_url"; then
    warnings+=("Failed to download $download_url")
    rm -rf "$tmp_dir"
    return 1
  fi
  if ! tar -xzf "$tmp_dir/gh.tar.gz" -C "$tmp_dir"; then
    warnings+=('Failed to extract gh tarball.')
    rm -rf "$tmp_dir"
    return 1
  fi

  mkdir -p "$HOME/.local/bin"
  local extracted
  extracted="$(find "$tmp_dir" -name 'gh' -type f | head -n 1)"
  if [ -z "$extracted" ]; then
    warnings+=('gh binary not found in extracted tarball.')
    rm -rf "$tmp_dir"
    return 1
  fi
  install -m 0755 "$extracted" "$HOME/.local/bin/gh"
  applied_changes+=("installed_gh_v${version}_to_local_bin")
  rm -rf "$tmp_dir"
  return 0
}

if install_via_brew; then
  :
elif install_via_release_tarball; then
  :
else
  manual_steps+=('Install GitHub CLI manually: https://cli.github.com/')
  emit_result 'failed' 'false' 1
fi

if command -v gh >/dev/null 2>&1; then
  emit_result 'ready' 'true' 0
else
  warnings+=('gh binary still missing after install.')
  manual_steps+=('Ensure $HOME/.local/bin is on PATH so the new gh binary is reachable.')
  emit_result 'failed' 'false' 1
fi
