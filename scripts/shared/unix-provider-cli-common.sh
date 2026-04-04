#!/usr/bin/env bash

if [ -n "${CATS_PLATFORM_UNIX_PROVIDER_COMMON_SH:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
readonly CATS_PLATFORM_UNIX_PROVIDER_COMMON_SH=1

provider_display_name() {
  case "$1" in
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
  local url
  url="$(provider_install_url "$provider")"

  case "$provider" in
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
Usage: $script_name [--check] [-upgrade] [-force] [--help]

Repo-owned self-hosted helper for $(provider_display_name "$provider").

Options:
  --check    Verify whether the provider CLI is reachable on this host.
  -upgrade   Upgrade the provider CLI if already installed, otherwise install it.
  -force     Reinstall the provider CLI even when already present.
  --help     Show this help text.
EOF
}

run_native_provider_installer() {
  local platform="$1"
  local provider="$2"
  shift 2

  local check_only='false'
  local upgrade='false'
  local force='false'
  local shell_rc
  local command_path=''
  local display_name
  local attempt=1

  while [ $# -gt 0 ]; do
    case "$1" in
      --check)
        check_only='true'
        ;;
      -upgrade)
        upgrade='true'
        ;;
      -force)
        force='true'
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

  if [ "$force" = 'true' ]; then
    upgrade='false'
  fi

  display_name="$(provider_display_name "$provider")"
  shell_rc="$(detect_shell_rc)"

  if command_path="$(detect_provider_command "$platform" "$provider")"; then
    if [ "$check_only" = 'true' ]; then
      printf '%s installed: %s\n' "$display_name" "$(provider_version_line "$command_path")"
      return 0
    fi

    if [ "$force" = 'false' ] && [ "$upgrade" = 'false' ]; then
      ensure_local_bin_path_export "$shell_rc"
      ensure_provider_alias "$shell_rc" "$provider"
      printf '%s already installed: %s\n' "$display_name" "$(provider_version_line "$command_path")"
      return 0
    fi
  else
    if [ "$check_only" = 'true' ]; then
      printf '%s is not installed.\n' "$display_name" >&2
      return 1
    fi
  fi

  printf 'Installing %s...\n' "$display_name"
  if [ "$force" = 'true' ]; then
    run_provider_install_action "$platform" "$provider" 'force'
  elif [ "$upgrade" = 'true' ]; then
    run_provider_install_action "$platform" "$provider" 'upgrade'
  else
    run_provider_install_action "$platform" "$provider" 'install'
  fi

  ensure_local_bin_path_export "$shell_rc"
  ensure_provider_alias "$shell_rc" "$provider"

  while [ $attempt -le 3 ]; do
    if command_path="$(detect_provider_command "$platform" "$provider")"; then
      printf '%s ready: %s\n' "$display_name" "$(provider_version_line "$command_path")"
      printf 'Reload your shell if %s is not visible yet: source %s\n' "$display_name" "$shell_rc"
      return 0
    fi

    sleep 2
    attempt=$((attempt + 1))
  done

  printf 'Failed to verify %s after install.\n' "$display_name" >&2
  return 1
}
