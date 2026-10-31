#!/usr/bin/env bash
#
# Packaged Cats macOS host helper: install or upgrade Git through Homebrew.
#
# Implements the packaged-helper contract used by Desktop setup:
#   --check / --apply / -upgrade / -force / --json
# Cats Code runs git from PATH for worktrees, branches, commits and pushes.
#
# Any working git on PATH counts as installed, including the Command Line
# Tools one. /usr/bin/git is a stub that opens the Command Line Tools installer
# when the tools are missing, so it runs only after xcode-select reports a
# developer directory that contains git.
#
# Installation uses Homebrew's git, non-interactively. Without Homebrew the
# helper returns a manual step that names it; installing Homebrew is the step
# before Git. Check mode also reports a manual step when the global user.name
# or user.email is empty, and stays ready.
#
# Uninstall is intentionally omitted: git is a machine-wide tool the user may
# rely on outside Cats. Everything except git, xcode-select and brew is a shell
# builtin, so a sparse Desktop PATH cannot break the check.

set -euo pipefail

HELPER_ID='macos-git-installer'
DISPLAY_NAME='Git'
CLT_GIT_STUB='/usr/bin/git'
IDENTITY_STEP='Set your commit identity: git config --global user.name "Your Name" and git config --global user.email "you@example.com".'
HOMEBREW_STEP='Install Homebrew from https://brew.sh, then set up Git.'
MANUAL_INSTALL_STEP='Install Git manually from https://git-scm.com/download/mac.'

mode='check'
emit_json='false'
install_state='auto'
detected_version_override=''
skip_git_probe='false'

print_help() {
  printf '%s\n' \
    'Usage: install-git.sh [--check] [--apply] [-upgrade] [-force] [--json]' \
    '                      [--install-state auto|installed|missing] [--detected-version <ver>]' \
    '                      [--skip-git-probe]'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --check|-CheckOnly) mode='check' ;;
    --apply|-Apply) mode='apply' ;;
    -upgrade|-Upgrade) mode='upgrade' ;;
    -force|-Force) mode='force' ;;
    --json|-Json) emit_json='true' ;;
    --dry-run|-DryRun) ;;  # Accepted for parity with the Windows helper; not honored.
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
declare -a applied_changes=()
declare -a warnings=()
declare -a manual_steps=()
relaunch_reason=''

# A Desktop-launched helper inherits the launchd PATH, which has neither
# Homebrew location. Include both in this process only.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Homebrew 5 asks before install, upgrade and reinstall unless told not to.
export HOMEBREW_NO_ASK=1
export HOMEBREW_NO_ENV_HINTS=1

git_command=''
git_version_line=''

clt_git_ready() {
  local developer_dir
  command -v xcode-select >/dev/null 2>&1 || return 1
  developer_dir="$(xcode-select -p 2>/dev/null)" || return 1
  [ -n "$developer_dir" ] && [ -x "$developer_dir/usr/bin/git" ]
}

# Sets git_command and git_version_line to the first working git on PATH.
probe_git() {
  local candidate line
  git_command=''
  git_version_line=''
  [ "$skip_git_probe" = 'true' ] && return 1
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ "$candidate" = "$CLT_GIT_STUB" ] && ! clt_git_ready; then
      continue
    fi
    if line="$("$candidate" --version 2>/dev/null)"; then
      git_command="$candidate"
      git_version_line="${line%%$'\n'*}"
      return 0
    fi
  done <<EOF
$(type -ap git)
EOF
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

brew_available() {
  command -v brew >/dev/null 2>&1
}

brew_run() {
  brew "$@" </dev/null >/dev/null 2>&1
}

# Replacements come from variables: bash 3.2 keeps backslashes typed into a
# double-quoted replacement, while bash 4.3 and later remove them.
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
  local exit_code="$3"
  local detected interruptions='[]' item

  detected="$(resolve_git_version)"
  if [ -n "$relaunch_reason" ]; then
    interruptions="[{\"kind\":\"relaunch_required\",\"reason\":\"$(json_escape "$relaunch_reason")\"}]"
  fi

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
    printf '  "appliedChanges": %s,\n' "$(json_array ${applied_changes[@]+"${applied_changes[@]}"})"
    printf '  "warnings": %s,\n' "$(json_array ${warnings[@]+"${warnings[@]}"})"
    printf '  "manualSteps": %s,\n' "$(json_array ${manual_steps[@]+"${manual_steps[@]}"})"
    printf '  "interruptions": %s\n' "$interruptions"
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

  exit "$exit_code"
}

probe_git || true
installed='false'
if is_git_installed; then
  installed='true'
fi

# Mode: check
if [ "$mode" = 'check' ]; then
  if [ "$installed" = 'true' ]; then
    if git_identity_missing; then
      manual_steps+=("$IDENTITY_STEP")
    fi
    emit_result 'ready' 'true' 0
  fi
  planned_actions+=('install_git')
  if [ "$skip_git_probe" = 'false' ] && ! brew_available; then
    manual_steps+=("$HOMEBREW_STEP")
  fi
  emit_result 'changes_required' 'false' 0
fi

# Mode: apply (idempotent)
if [ "$mode" = 'apply' ] && [ "$installed" = 'true' ]; then
  emit_result 'ready' 'true' 0
fi

if [ "$skip_git_probe" = 'true' ]; then
  manual_steps+=("$MANUAL_INSTALL_STEP")
  emit_result 'failed' "$installed" 1
fi

if ! brew_available; then
  manual_steps+=("$HOMEBREW_STEP")
  emit_result 'changes_required' "$installed" 0
fi

# Mutation modes. Returns 0 after a Homebrew change or a deliberate no-op.
install_via_brew() {
  case "$mode" in
    upgrade)
      if brew_run list --versions git; then
        if brew_run upgrade git; then
          applied_changes+=('brew_upgrade_git')
          relaunch_reason='Git was upgraded; relaunch Cats so Runtime uses it.'
          return 0
        fi
        return 1
      fi
      if [ "$installed" = 'true' ]; then
        # The Command Line Tools git updates through Software Update. A second,
        # Homebrew git would not replace it for a Desktop-launched Runtime.
        warnings+=('Git is not managed by Homebrew; update it where it was installed.')
        return 0
      fi
      ;;
    force)
      if brew_run reinstall git || brew_run install git; then
        applied_changes+=('brew_force_install_git')
        relaunch_reason='Git was reinstalled; relaunch Cats so Runtime uses it.'
        return 0
      fi
      return 1
      ;;
  esac
  if brew_run install git; then
    applied_changes+=('brew_install_git')
    relaunch_reason='Git was installed; relaunch Cats so Runtime finds it.'
    return 0
  fi
  return 1
}

if ! install_via_brew; then
  warnings+=('Homebrew could not install Git.')
  manual_steps+=("$MANUAL_INSTALL_STEP")
  emit_result 'failed' "$installed" 1
fi

if probe_git; then
  emit_result 'ready' 'true' 0
fi

relaunch_reason=''
warnings+=('git is still missing from PATH after the install.')
manual_steps+=("$MANUAL_INSTALL_STEP")
emit_result 'failed' 'false' 1
