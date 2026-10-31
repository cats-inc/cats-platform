#!/usr/bin/env bash
#
# Packaged Cats Linux host helper: check Git and name how to install it.
#
# Implements the packaged-helper contract used by Desktop setup:
#   --check / --json (--apply / -upgrade / -force report the same check)
# Cats Code runs git from PATH for worktrees, branches, commits and pushes.
#
# Linux packaged helpers never use sudo; Node.js, for example, comes from nvm
# under $HOME. Git comes from the distribution's package manager, which needs
# root, so this helper only checks. When git is missing it returns a manual step
# naming the install command for the detected package manager. Check mode also
# reports a manual step when the global user.name or user.email is empty, and
# stays ready.
#
# Everything except git is a shell builtin, so a sparse Desktop PATH cannot
# break the check.

set -euo pipefail

HELPER_ID='linux-git-installer'
DISPLAY_NAME='Git'
IDENTITY_STEP='Set your commit identity: git config --global user.name "Your Name" and git config --global user.email "you@example.com".'

mode='check'
emit_json='false'
install_state='auto'
detected_version_override=''
skip_git_probe='false'

print_help() {
  printf '%s\n' \
    'Usage: install-git.sh [--check] [--json]' \
    '                      [--install-state auto|installed|missing] [--detected-version <ver>]' \
    '                      [--skip-git-probe]' \
    '' \
    'Checks git only. It never runs sudo: when git is missing it names the' \
    'command that installs it, and --apply, -upgrade and -force report the same.'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --check|-CheckOnly) mode='check' ;;
    --apply|-Apply) mode='apply' ;;
    -upgrade|-Upgrade) mode='upgrade' ;;
    -force|-Force) mode='force' ;;
    --json|-Json) emit_json='true' ;;
    --dry-run|-DryRun) ;;  # Accepted for parity with the Windows helper; nothing is changed anyway.
    --install-state)
      shift; install_state="${1:-auto}"
      ;;
    --detected-version)
      shift; detected_version_override="${1:-}"
      ;;
    --skip-git-probe) skip_git_probe='true' ;;
    -h|--help) print_help; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; print_help >&2; exit 1 ;;
  esac
  shift
done

declare -a planned_actions=()
declare -a warnings=()
declare -a manual_steps=()

git_command=''
git_version_line=''

# Sets git_command and git_version_line when git on PATH runs.
probe_git() {
  local candidate line
  git_command=''
  git_version_line=''
  [ "$skip_git_probe" = 'true' ] && return 1
  candidate="$(command -v git 2>/dev/null)" || return 1
  if line="$("$candidate" --version 2>/dev/null)"; then
    git_command="$candidate"
    git_version_line="${line%%$'\n'*}"
    return 0
  fi
  return 1
}

resolve_git_version() {
  local pattern='([0-9]+\.[0-9]+\.[0-9]+)'
  if [ -n "$detected_version_override" ]; then
    printf '%s' "$detected_version_override"
    return
  fi
  if [[ "$git_version_line" =~ $pattern ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

is_git_installed() {
  case "$install_state" in
    installed) return 0 ;;
    missing) return 1 ;;
  esac
  [ -n "$git_command" ]
}

# True only when git ran and returned an empty user.name or user.email.
git_identity_missing() {
  local key value
  [ -n "$git_command" ] || return 1
  for key in user.name user.email; do
    value="$("$git_command" config --global --get "$key" 2>/dev/null || true)"
    if [ -z "${value//[[:space:]]/}" ]; then
      return 0
    fi
  done
  return 1
}

install_step() {
  local manager
  for manager in apt-get dnf yum; do
    if command -v "$manager" >/dev/null 2>&1; then
      printf 'Install Git in a terminal with: sudo %s install git' "$manager"
      return
    fi
  done
  printf 'Install Git with your distribution package manager (https://git-scm.com/download/linux).'
}

# Replacements come from variables so every bash version treats them alike.
json_escape() {
  local value=$1 bs='\' dq='"'
  value=${value//"$bs"/$bs$bs}
  value=${value//"$dq"/$bs$dq}
  printf '%s' "$value"
}

json_array() {
  local out='[' sep='' item
  for item in "$@"; do
    [ -n "$item" ] || continue
    out="$out$sep\"$(json_escape "$item")\""
    sep=','
  done
  printf '%s]' "$out"
}

emit_result() {
  local status="$1"
  local installed="$2"
  local detected item

  detected="$(resolve_git_version)"

  if [ "$emit_json" = 'true' ]; then
    printf '{\n'
    printf '  "helper": "%s",\n' "$HELPER_ID"
    printf '  "displayName": "%s",\n' "$DISPLAY_NAME"
    printf '  "mode": "%s",\n' "$mode"
    printf '  "status": "%s",\n' "$status"
    printf '  "installed": %s,\n' "$installed"
    printf '  "commandPath": "%s",\n' "$(json_escape "$git_command")"
    printf '  "detectedVersion": "%s",\n' "$(json_escape "$detected")"
    printf '  "plannedActions": %s,\n' "$(json_array ${planned_actions[@]+"${planned_actions[@]}"})"
    printf '  "appliedChanges": [],\n'
    printf '  "warnings": %s,\n' "$(json_array ${warnings[@]+"${warnings[@]}"})"
    printf '  "manualSteps": %s,\n' "$(json_array ${manual_steps[@]+"${manual_steps[@]}"})"
    printf '  "interruptions": []\n'
    printf '}\n'
  else
    printf 'Helper: %s\n' "$HELPER_ID"
    printf 'Mode: %s\n' "$mode"
    printf 'Status: %s\n' "$status"
    printf 'Installed: %s\n' "$installed"
    [ -n "$detected" ] && printf 'Detected version: %s\n' "$detected"
    for item in ${warnings[@]+"${warnings[@]}"}; do
      printf 'Warning: %s\n' "$item" >&2
    done
    for item in ${manual_steps[@]+"${manual_steps[@]}"}; do
      printf 'Manual step: %s\n' "$item"
    done
  fi

  exit 0
}

if [ "$mode" != 'check' ]; then
  warnings+=('Git is installed with the system package manager on Linux; this helper only checks it.')
fi

probe_git || true
if is_git_installed; then
  if [ "$mode" = 'check' ] && git_identity_missing; then
    manual_steps+=("$IDENTITY_STEP")
  fi
  emit_result 'ready' 'true'
fi

planned_actions+=('install_git')
if [ "$skip_git_probe" = 'false' ]; then
  manual_steps+=("$(install_step)")
fi
emit_result 'changes_required' 'false'
