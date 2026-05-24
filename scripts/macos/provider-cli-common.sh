#!/usr/bin/env bash

if [ -n "${CATS_PLATFORM_UNIX_PROVIDER_COMMON_SH:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
readonly CATS_PLATFORM_UNIX_PROVIDER_COMMON_SH=1

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

json_bool() {
  if [ "$1" = 'true' ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

json_string_array() {
  local first='true'
  local value=''
  printf '['
  for value in "$@"; do
    [ -n "$value" ] || continue
    if [ "$first" = 'false' ]; then
      printf ','
    fi
    first='false'
    printf '"%s"' "$(json_escape "$value")"
  done
  printf ']'
}

platform_label() {
  case "$1" in
    linux) printf '%s\n' 'Linux' ;;
    macos) printf '%s\n' 'macOS' ;;
    windows) printf '%s\n' 'Windows' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

provider_display_name() {
  case "$1" in
    antigravity) printf '%s\n' 'Antigravity CLI' ;;
    claude) printf '%s\n' 'Claude Code CLI' ;;
    cursor) printf '%s\n' 'Cursor Agent CLI' ;;
    goose) printf '%s\n' 'Goose CLI' ;;
    junie) printf '%s\n' 'Junie CLI' ;;
    kiro) printf '%s\n' 'Kiro CLI' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

provider_primary_command() {
  case "$1" in
    antigravity) printf '%s\n' 'agy' ;;
    claude) printf '%s\n' 'claude' ;;
    cursor) printf '%s\n' 'cursor-agent' ;;
    goose) printf '%s\n' 'goose' ;;
    junie) printf '%s\n' 'junie' ;;
    kiro) printf '%s\n' 'kiro-cli' ;;
    *) return 1 ;;
  esac
}

provider_alias_name() {
  case "$1" in
    cursor) printf '%s\n' 'ca' ;;
    kiro) printf '%s\n' 'kc' ;;
    *) printf '\n' ;;
  esac
}

provider_alias_target() {
  case "$1" in
    cursor) printf '%s\n' 'cursor-agent' ;;
    kiro) printf '%s\n' 'kiro-cli' ;;
    *) printf '\n' ;;
  esac
}

provider_install_url() {
  case "$1" in
    antigravity) printf '%s\n' 'https://antigravity.google/cli/install.sh' ;;
    claude) printf '%s\n' 'https://claude.ai/install.sh' ;;
    cursor) printf '%s\n' 'https://cursor.com/install' ;;
    goose) printf '%s\n' 'https://github.com/block/goose/releases/download/stable/download_cli.sh' ;;
    junie) printf '%s\n' 'https://junie.jetbrains.com/install.sh' ;;
    kiro) printf '%s\n' 'https://cli.kiro.dev/install' ;;
    *) return 1 ;;
  esac
}

provider_binary_candidates() {
  local platform="$1"
  local provider="$2"

  case "$provider" in
    antigravity)
      printf '%s\n' "$HOME/.local/bin/agy"
      ;;
    claude)
      printf '%s\n' "$HOME/.local/bin/claude"
      ;;
    cursor)
      printf '%s\n' "$HOME/.local/bin/cursor-agent"
      ;;
    goose)
      printf '%s\n' "$HOME/.local/bin/goose"
      ;;
    junie)
      printf '%s\n' "$HOME/.local/bin/junie"
      ;;
    kiro)
      printf '%s\n' "$HOME/.local/bin/kiro-cli"
      printf '%s\n' '/usr/local/bin/kiro-cli'
      printf '%s\n' '/opt/homebrew/bin/kiro-cli'
      if [ "$platform" = 'macos' ]; then
        printf '%s\n' '/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli'
      fi
      ;;
  esac
}

detect_shell_rc() {
  if [ -n "${ZSH_VERSION:-}" ] || [ "${SHELL:-}" = '/bin/zsh' ]; then
    printf '%s\n' "$HOME/.zshrc"
    return
  fi

  if [ -n "${BASH_VERSION:-}" ] || [ "${SHELL:-}" = '/bin/bash' ]; then
    printf '%s\n' "$HOME/.bashrc"
    return
  fi

  printf '%s\n' "$HOME/.bashrc"
}

touch_parent_file() {
  local file_path="$1"
  mkdir -p "$(dirname "$file_path")"
  touch "$file_path"
}

append_line_if_missing() {
  local file_path="$1"
  local literal="$2"
  local line="$3"

  touch_parent_file "$file_path"

  if ! grep -Fqx "$literal" "$file_path" 2>/dev/null; then
    printf '%s\n' "$line" >> "$file_path"
  fi
}

prepend_path_if_missing() {
  local target_dir="$1"
  if [ -n "$target_dir" ] && [ -d "$target_dir" ] && [[ ":$PATH:" != *":$target_dir:"* ]]; then
    export PATH="$target_dir:$PATH"
  fi
}

ensure_local_bin_path_export() {
  local shell_rc="$1"
  append_line_if_missing "$shell_rc" '# Added by cats-platform self-hosted provider helpers' '# Added by cats-platform self-hosted provider helpers'
  append_line_if_missing "$shell_rc" 'export PATH="$HOME/.local/bin:$PATH"' 'export PATH="$HOME/.local/bin:$PATH"'
  prepend_path_if_missing "$HOME/.local/bin"
}

rewrite_alias_line() {
  local shell_rc="$1"
  local alias_name="$2"
  local alias_target="$3"
  local replaced='false'
  local tmp_file
  tmp_file="$(mktemp)"

  if [ -f "$shell_rc" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      if [ "$replaced" = 'false' ] && printf '%s\n' "$line" | grep -Eq "^[[:space:]]*alias[[:space:]]+${alias_name}="; then
        printf "alias %s='%s'\n" "$alias_name" "$alias_target" >> "$tmp_file"
        replaced='true'
      else
        printf '%s\n' "$line" >> "$tmp_file"
      fi
    done < "$shell_rc"
  fi

  if [ "$replaced" = 'false' ]; then
    printf "alias %s='%s'\n" "$alias_name" "$alias_target" >> "$tmp_file"
  fi

  mv "$tmp_file" "$shell_rc"
}

ensure_provider_alias() {
  local shell_rc="$1"
  local provider="$2"
  local alias_name
  local alias_target
  local existing_line

  alias_name="$(provider_alias_name "$provider")"
  alias_target="$(provider_alias_target "$provider")"

  if [ -z "$alias_name" ] || [ -z "$alias_target" ]; then
    return 0
  fi

  touch_parent_file "$shell_rc"
  existing_line="$(grep -E "^[[:space:]]*alias[[:space:]]+${alias_name}=" "$shell_rc" 2>/dev/null | tail -1 || true)"

  if [ -z "$existing_line" ]; then
    printf "alias %s='%s'\n" "$alias_name" "$alias_target" >> "$shell_rc"
    return 0
  fi

  if printf '%s\n' "$existing_line" | grep -Eq "['\"]${alias_target}['\"]"; then
    return 0
  fi

  if [ "$alias_name" = 'kc' ] && printf '%s\n' "$existing_line" | grep -Eq "=['\"]?(kiro|q)['\"]?$"; then
    rewrite_alias_line "$shell_rc" "$alias_name" "$alias_target"
  fi
}

detect_provider_command() {
  local platform="$1"
  local provider="$2"
  local primary_command
  local candidate

  primary_command="$(provider_primary_command "$provider")"
  if command -v "$primary_command" >/dev/null 2>&1; then
    command -v "$primary_command"
    return 0
  fi

  while IFS= read -r candidate; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      prepend_path_if_missing "$(dirname "$candidate")"
      printf '%s\n' "$candidate"
      return 0
    fi
  done <<EOF
$(provider_binary_candidates "$platform" "$provider")
EOF

  return 1
}

provider_version_line() {
  local command_path="$1"
  "$command_path" --version 2>&1 | head -1 || true
}

run_remote_pipe_installer() {
  local provider="$1"
  shift
  local url
  url="$(provider_install_url "$provider")"

  case "$provider" in
    antigravity)
      curl -fsSL "$url" | bash -s -- "$@"
      ;;
    goose)
      curl -fsSL "$url" | env CONFIGURE=false bash
      ;;
    cursor)
      curl "$url" -fsSL | bash
      ;;
    claude|junie)
      curl -fsSL "$url" | bash
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_kiro_cli_symlink_macos() {
  local app_dir='/Applications/Kiro CLI.app/Contents/MacOS'
  local bin_dir="$HOME/.local/bin"
  local binary_name

  if [ ! -d "$app_dir" ]; then
    return 0
  fi

  mkdir -p "$bin_dir"
  for binary_name in kiro-cli kiro-cli-chat kiro-cli-term; do
    if [ -x "$app_dir/$binary_name" ]; then
      ln -sf "$app_dir/$binary_name" "$bin_dir/$binary_name"
    fi
  done
}

run_kiro_installer() {
  local platform="$1"
  local mode="$2"
  local installer_path

  installer_path="$(mktemp)"
  curl -fsSL "$(provider_install_url kiro)" -o "$installer_path"
  chmod +x "$installer_path"

  if [ "$mode" = 'reinstall' ]; then
    rm -f "$HOME/.local/bin/kiro-cli" "$HOME/.local/bin/kiro-cli-chat" "$HOME/.local/bin/kiro-cli-term"
    if [ "$platform" = 'macos' ]; then
      rm -rf '/Applications/Kiro CLI.app'
      rm -f "$HOME/.local/bin/bash (kiro-cli-term)" "$HOME/.local/bin/fish (kiro-cli-term)" \
        "$HOME/.local/bin/nu (kiro-cli-term)" "$HOME/.local/bin/zsh (kiro-cli-term)"
    fi
  fi

  bash "$installer_path" --force < /dev/null
  rm -f "$installer_path"

  if [ "$platform" = 'macos' ]; then
    ensure_kiro_cli_symlink_macos
  fi
}

run_provider_install_action() {
  local platform="$1"
  local provider="$2"
  local action="$3"
  local current_command=''

  case "$provider" in
    antigravity)
      if [ "$action" = 'upgrade' ]; then
        run_remote_pipe_installer "$provider" '-upgrade'
      elif [ "$action" = 'force' ]; then
        run_remote_pipe_installer "$provider" '-force'
      else
        run_remote_pipe_installer "$provider"
      fi
      ;;
    claude)
      if [ "$action" = 'upgrade' ] && current_command="$(detect_provider_command "$platform" "$provider")"; then
        "$current_command" update || true
      else
        run_remote_pipe_installer "$provider"
      fi
      ;;
    cursor|goose|junie)
      run_remote_pipe_installer "$provider"
      ;;
    kiro)
      if [ "$action" = 'upgrade' ] || [ "$action" = 'force' ]; then
        run_kiro_installer "$platform" 'reinstall'
      else
        run_kiro_installer "$platform" 'install'
      fi
      ;;
    *)
      return 1
      ;;
  esac
}

provider_help() {
  local script_name="$1"
  local provider="$2"
  cat <<EOF
Usage: $script_name [-CheckOnly] [-Apply] [-Upgrade] [-Force] [-Uninstall] [-DryRun] [-Json] [--help]

Repo-owned self-hosted helper for $(provider_display_name "$provider").

Options:
  -CheckOnly Verify whether the provider CLI is reachable on this host.
  -Apply     Install the provider CLI if it is missing.
  -Upgrade   Upgrade the provider CLI if already installed, otherwise install it.
  -Force     Reinstall the provider CLI even when already present.
  -Uninstall Remove the provider CLI binaries from user-owned install paths.
  -DryRun    Show the planned mutation without changing the host.
  -Json      Emit structured JSON output for the packaged setup bridge.
  --help     Show this help text.
EOF
}

# Globals populated by uninstall_provider_native_paths.
# Bash 3.2 (macOS /bin/bash) lacks `local -n` namerefs, so we use named globals.
__CATS_UNINSTALL_PLANNED=()
__CATS_UNINSTALL_APPLIED=()
__CATS_UNINSTALL_WARNINGS=()
__CATS_UNINSTALL_REMAINING=''

uninstall_provider_native_paths() {
  local platform="$1"
  local provider="$2"
  local dry_run="${3:-false}"

  __CATS_UNINSTALL_PLANNED=()
  __CATS_UNINSTALL_APPLIED=()
  __CATS_UNINSTALL_WARNINGS=()
  __CATS_UNINSTALL_REMAINING=''

  local primary_command primary_path candidate path extra existing already
  local planned_paths=()

  primary_command="$(provider_primary_command "$provider")"
  if primary_path="$(command -v "$primary_command" 2>/dev/null)"; then
    case "$primary_path" in
      "$HOME"/*) planned_paths+=("$primary_path") ;;
    esac
  fi

  while IFS= read -r candidate; do
    [ -z "$candidate" ] && continue
    case "$candidate" in
      "$HOME"/*)
        if [ -e "$candidate" ] || [ -L "$candidate" ]; then
          already='false'
          for existing in "${planned_paths[@]}"; do
            [ "$existing" = "$candidate" ] && already='true' && break
          done
          [ "$already" = 'false' ] && planned_paths+=("$candidate")
        fi
        ;;
    esac
  done <<UPNP_EOF
$(provider_binary_candidates "$platform" "$provider")
UPNP_EOF

  if [ "$provider" = 'kiro' ]; then
    for extra in kiro-cli-chat kiro-cli-term; do
      if [ -e "$HOME/.local/bin/$extra" ] || [ -L "$HOME/.local/bin/$extra" ]; then
        planned_paths+=("$HOME/.local/bin/$extra")
      fi
    done
    if [ "$platform" = 'macos' ] && [ -d '/Applications/Kiro CLI.app' ]; then
      planned_paths+=('/Applications/Kiro CLI.app')
    fi
  fi

  for path in "${planned_paths[@]}"; do
    __CATS_UNINSTALL_PLANNED+=("remove:$path")
  done

  if [ "$dry_run" != 'true' ]; then
    for path in "${planned_paths[@]}"; do
      if [ -d "$path" ] && [ ! -L "$path" ]; then
        if rm -rf "$path" 2>/dev/null; then
          __CATS_UNINSTALL_APPLIED+=("removed:$path")
        else
          __CATS_UNINSTALL_WARNINGS+=("failed_to_remove:$path")
        fi
      elif [ -e "$path" ] || [ -L "$path" ]; then
        if rm -f "$path" 2>/dev/null; then
          __CATS_UNINSTALL_APPLIED+=("removed:$path")
        else
          __CATS_UNINSTALL_WARNINGS+=("failed_to_remove:$path")
        fi
      fi
    done
  fi

  if primary_path="$(detect_provider_command "$platform" "$provider")"; then
    __CATS_UNINSTALL_REMAINING="$primary_path"
  fi
}

run_native_provider_installer() {
  local platform="$1"
  local provider="$2"
  shift 2

  local check_only='false'
  local apply='false'
  local upgrade='false'
  local force='false'
  local uninstall='false'
  local dry_run='false'
  local emit_json='false'
  local shell_rc
  local command_path=''
  local display_name
  local attempt=1
  local execution_mode='apply'
  local initial_installed='false'
  local detected_version=''
  local planned_actions=()
  local applied_changes=()
  local warnings=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --check|-CheckOnly)
        check_only='true'
        ;;
      -Apply)
        apply='true'
        ;;
      -upgrade|-Upgrade)
        upgrade='true'
        ;;
      -force|-Force)
        force='true'
        ;;
      --uninstall|-Uninstall)
        uninstall='true'
        ;;
      --dry-run|-DryRun)
        dry_run='true'
        ;;
      --json|-Json)
        emit_json='true'
        ;;
      -h|--help)
        provider_help "$(basename "$0")" "$provider"
        return 0
        ;;
      *)
        printf 'Unknown option: %s\n' "$1" >&2
        provider_help "$(basename "$0")" "$provider" >&2
        return 1
        ;;
    esac
    shift
  done

  local mutation_count=0
  [ "$apply" = 'true' ] && mutation_count=$((mutation_count + 1))
  [ "$upgrade" = 'true' ] && mutation_count=$((mutation_count + 1))
  [ "$force" = 'true' ] && mutation_count=$((mutation_count + 1))

  if [ "$uninstall" = 'true' ] && { [ "$check_only" = 'true' ] || [ "$mutation_count" -gt 0 ]; }; then
    printf '%s accepts -Uninstall as a mutually exclusive mode.\n' "$(basename "$0")" >&2
    return 1
  fi

  if [ "$check_only" = 'true' ] && [ "$mutation_count" -gt 0 ]; then
    printf '%s accepts either -CheckOnly or one mutation mode.\n' "$(basename "$0")" >&2
    return 1
  fi

  if [ "$mutation_count" -gt 1 ]; then
    printf '%s accepts at most one of -Apply / -Upgrade / -Force.\n' "$(basename "$0")" >&2
    return 1
  fi

  if [ "$force" = 'true' ]; then
    upgrade='false'
  fi

  if [ "$uninstall" = 'true' ]; then
    execution_mode='uninstall'
  elif [ "$check_only" = 'true' ]; then
    execution_mode='check'
  elif [ "$force" = 'true' ]; then
    execution_mode='force'
  elif [ "$upgrade" = 'true' ]; then
    execution_mode='upgrade'
  else
    execution_mode='apply'
  fi

  display_name="$(provider_display_name "$provider")"
  shell_rc="$(detect_shell_rc)"

  if [ "$execution_mode" = 'uninstall' ]; then
    local alias_name
    local uninstall_planned=()
    local uninstall_applied=()
    local uninstall_warnings=()
    local uninstall_remaining=''

    uninstall_provider_native_paths "$platform" "$provider" "$dry_run"
    uninstall_planned=("${__CATS_UNINSTALL_PLANNED[@]}")
    uninstall_applied=("${__CATS_UNINSTALL_APPLIED[@]}")
    uninstall_warnings=("${__CATS_UNINSTALL_WARNINGS[@]}")
    uninstall_remaining="$__CATS_UNINSTALL_REMAINING"

    alias_name="$(provider_alias_name "$provider")"
    if [ -n "$alias_name" ] && [ -f "$shell_rc" ] && grep -Eq "^[[:space:]]*alias[[:space:]]+${alias_name}=" "$shell_rc" 2>/dev/null; then
      uninstall_warnings+=("alias_${alias_name}_remains_in:$shell_rc")
    fi

    local uninstall_status
    if [ ${#uninstall_planned[@]} -eq 0 ]; then
      uninstall_status='not_installed'
    elif [ "$dry_run" = 'true' ]; then
      uninstall_status='preview'
    elif [ -n "$uninstall_remaining" ]; then
      uninstall_status='changes_required'
    elif [ ${#uninstall_warnings[@]} -gt 0 ]; then
      uninstall_status='changes_required'
    else
      uninstall_status='uninstalled'
    fi

    if [ -n "$uninstall_remaining" ]; then
      uninstall_warnings+=("system_install_remains_at:$uninstall_remaining")
    fi

    local uninstall_installed='false'
    local uninstall_command_path='null'
    if [ -n "$uninstall_remaining" ]; then
      uninstall_installed='true'
      uninstall_command_path="\"$(json_escape "$uninstall_remaining")\""
    fi

    if [ "$emit_json" = 'true' ]; then
      printf '{'
      printf '"helper":"%s-%s-native-installer",' "$platform" "$provider"
      printf '"mode":"uninstall",'
      printf '"status":"%s",' "$uninstall_status"
      printf '"installed":%s,' "$uninstall_installed"
      printf '"commandPath":%s,' "$uninstall_command_path"
      printf '"detectedVersion":null,'
      printf '"plannedActions":'
      json_string_array "${uninstall_planned[@]}"
      printf ','
      printf '"appliedChanges":'
      json_string_array "${uninstall_applied[@]}"
      printf ','
      printf '"warnings":'
      json_string_array "${uninstall_warnings[@]}"
      printf ','
      if [ -n "$uninstall_remaining" ]; then
        printf '"manualSteps":["Remove the remaining %s install at %s using your package manager."],' \
          "$(json_escape "$display_name")" "$(json_escape "$uninstall_remaining")"
      else
        printf '"manualSteps":[],'
      fi
      printf '"interruptions":[]'
      printf '}\n'
    else
      case "$uninstall_status" in
        preview)
          printf '%s preview: %s path(s) planned for removal.\n' "$display_name" "${#uninstall_planned[@]}"
          ;;
        not_installed)
          printf '%s is not installed; nothing to remove.\n' "$display_name"
          ;;
        changes_required)
          printf '%s removal incomplete; remaining install at %s.\n' "$display_name" "$uninstall_remaining"
          ;;
        uninstalled)
          printf '%s removed.\n' "$display_name"
          ;;
      esac
    fi
    return 0
  fi

  if command_path="$(detect_provider_command "$platform" "$provider")"; then
    initial_installed='true'
    detected_version="$(provider_version_line "$command_path")"
    if [ "$check_only" = 'true' ]; then
      if [ "$emit_json" = 'true' ]; then
        printf '{'
        printf '"helper":"%s-%s-native-installer",' "$platform" "$provider"
        printf '"mode":"check",'
        printf '"status":"ready",'
        printf '"installed":true,'
        printf '"commandPath":"%s",' "$(json_escape "$command_path")"
        printf '"detectedVersion":"%s",' "$(json_escape "$detected_version")"
        printf '"plannedActions":[],'
        printf '"appliedChanges":[],'
        printf '"warnings":[],'
        printf '"manualSteps":[],'
        printf '"interruptions":[]'
        printf '}\n'
      else
        printf '%s installed: %s\n' "$display_name" "$detected_version"
      fi
      return 0
    fi

    if [ "$force" = 'false' ] && [ "$upgrade" = 'false' ]; then
      ensure_local_bin_path_export "$shell_rc"
      ensure_provider_alias "$shell_rc" "$provider"
      if [ "$emit_json" = 'true' ]; then
        printf '{'
        printf '"helper":"%s-%s-native-installer",' "$platform" "$provider"
        printf '"mode":"%s",' "$execution_mode"
        printf '"status":"ready",'
        printf '"installed":true,'
        printf '"commandPath":"%s",' "$(json_escape "$command_path")"
        printf '"detectedVersion":"%s",' "$(json_escape "$detected_version")"
        printf '"plannedActions":[],'
        printf '"appliedChanges":[],'
        printf '"warnings":[],'
        printf '"manualSteps":[],'
        printf '"interruptions":[]'
        printf '}\n'
      else
        printf '%s already installed: %s\n' "$display_name" "$detected_version"
      fi
      return 0
    fi
  else
    if [ "$check_only" = 'true' ]; then
      if [ "$emit_json" = 'true' ]; then
        printf '{'
        printf '"helper":"%s-%s-native-installer",' "$platform" "$provider"
        printf '"mode":"check",'
        printf '"status":"changes_required",'
        printf '"installed":false,'
        printf '"commandPath":null,'
        printf '"detectedVersion":null,'
        printf '"plannedActions":'
        json_string_array "install_${provider}_cli"
        printf ','
        printf '"appliedChanges":[],'
        printf '"warnings":[],'
        printf '"manualSteps":[],'
        printf '"interruptions":[]'
        printf '}\n'
        return 0
      fi
      printf '%s is not installed.\n' "$display_name" >&2
      return 1
    fi
  fi

  case "$execution_mode" in
    force) planned_actions=("reinstall_${provider}_cli") ;;
    upgrade)
      if [ "$initial_installed" = 'true' ]; then
        planned_actions=("upgrade_${provider}_cli")
      else
        planned_actions=("install_${provider}_cli")
      fi
      ;;
    apply)
      planned_actions=("install_${provider}_cli")
      ;;
  esac

  if [ "$dry_run" = 'true' ]; then
    if [ "$emit_json" = 'true' ]; then
      local dry_run_command_path='null'
      local dry_run_detected_version='null'
      if [ -n "$command_path" ]; then
        dry_run_command_path="\"$(json_escape "$command_path")\""
      fi
      if [ -n "$detected_version" ]; then
        dry_run_detected_version="\"$(json_escape "$detected_version")\""
      fi

      printf '{'
      printf '"helper":"%s-%s-native-installer",' "$platform" "$provider"
      printf '"mode":"%s",' "$execution_mode"
      printf '"status":"preview",'
      printf '"installed":%s,' "$(json_bool "$initial_installed")"
      printf '"commandPath":%s,' "$dry_run_command_path"
      printf '"detectedVersion":%s,' "$dry_run_detected_version"
      printf '"plannedActions":'
      json_string_array "${planned_actions[@]}"
      printf ','
      printf '"appliedChanges":[],'
      printf '"warnings":'
      json_string_array 'Dry-run requested; installer invocation was skipped.'
      printf ','
      printf '"manualSteps":[],'
      printf '"interruptions":[]'
      printf '}\n'
    else
      printf '%s preview: %s\n' "$display_name" "${planned_actions[*]}"
    fi
    return 0
  fi

  printf 'Installing %s...\n' "$display_name"
  if [ "$force" = 'true' ]; then
    run_provider_install_action "$platform" "$provider" 'force'
  elif [ "$upgrade" = 'true' ]; then
    run_provider_install_action "$platform" "$provider" 'upgrade'
  else
    run_provider_install_action "$platform" "$provider" 'install'
  fi
  applied_changes=("${planned_actions[@]}")

  ensure_local_bin_path_export "$shell_rc"
  ensure_provider_alias "$shell_rc" "$provider"

  while [ $attempt -le 3 ]; do
    if command_path="$(detect_provider_command "$platform" "$provider")"; then
      detected_version="$(provider_version_line "$command_path")"
      if [ "$emit_json" = 'true' ]; then
        warnings=("Reload your shell if ${display_name} is not visible yet: source ${shell_rc}")
        printf '{'
        printf '"helper":"%s-%s-native-installer",' "$platform" "$provider"
        printf '"mode":"%s",' "$execution_mode"
        printf '"status":"ready",'
        printf '"installed":true,'
        printf '"commandPath":"%s",' "$(json_escape "$command_path")"
        printf '"detectedVersion":"%s",' "$(json_escape "$detected_version")"
        printf '"plannedActions":'
        json_string_array "${planned_actions[@]}"
        printf ','
        printf '"appliedChanges":'
        json_string_array "${applied_changes[@]}"
        printf ','
        printf '"warnings":'
        json_string_array "${warnings[@]}"
        printf ','
        printf '"manualSteps":[],'
        printf '"interruptions":[]'
        printf '}\n'
      else
        printf '%s ready: %s\n' "$display_name" "$detected_version"
        printf 'Reload your shell if %s is not visible yet: source %s\n' "$display_name" "$shell_rc"
      fi
      return 0
    fi

    sleep 2
    attempt=$((attempt + 1))
  done

  if [ "$emit_json" = 'true' ]; then
    printf '{'
    printf '"helper":"%s-%s-native-installer",' "$platform" "$provider"
    printf '"mode":"%s",' "$execution_mode"
    printf '"status":"failed",'
    printf '"installed":false,'
    printf '"commandPath":null,'
    printf '"detectedVersion":null,'
    printf '"plannedActions":'
    json_string_array "${planned_actions[@]}"
    printf ','
    printf '"appliedChanges":'
    json_string_array "${applied_changes[@]}"
    printf ','
    printf '"warnings":[],'
    printf '"manualSteps":[],'
    printf '"interruptions":[]'
    printf '}\n'
    return 1
  fi
  printf 'Failed to verify %s after install.\n' "$display_name" >&2
  return 1
}
