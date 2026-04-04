#!/usr/bin/env bash

if [ -n "${CATS_PLATFORM_UNIX_NODE_COMMON_SH:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
readonly CATS_PLATFORM_UNIX_NODE_COMMON_SH=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=unix-provider-cli-common.sh
. "$SCRIPT_DIR/unix-provider-cli-common.sh"

normalize_npm_registry() {
  case "$1" in
    https://registry.npmjs.org|https://registry.npmjs.org/)
      printf '%s\n' 'https://registry.npmjs.org/'
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

load_nvm_if_present() {
  if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1090
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  fi
}

npmrc_has_prefix_conflict() {
  local npmrc="$HOME/.npmrc"
  if [ -n "${NPM_CONFIG_PREFIX:-}" ] || [ -n "${NPM_CONFIG_GLOBALCONFIG:-}" ]; then
    return 0
  fi
  if [ -f "$npmrc" ] && grep -q -E '^[[:space:]]*(prefix|globalconfig)[[:space:]]*=' "$npmrc"; then
    return 0
  fi
  return 1
}

nvm_is_active() {
  command -v nvm >/dev/null 2>&1
}

ensure_node_and_npm() {
  if ! command -v node >/dev/null 2>&1; then
    printf 'Node.js is required but was not found.\n' >&2
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    printf 'npm is required but was not found.\n' >&2
    return 1
  fi
}

ensure_npm_global_path_export() {
  local shell_rc="$1"
  append_line_if_missing "$shell_rc" '# Added by cats-platform self-hosted npm helpers' '# Added by cats-platform self-hosted npm helpers'
  append_line_if_missing "$shell_rc" 'export PATH="$HOME/.npm-global/bin:$PATH"' 'export PATH="$HOME/.npm-global/bin:$PATH"'
  prepend_path_if_missing "$HOME/.npm-global/bin"
}

node_prefix_ready() {
  local prefix
  local registry
  local shell_rc

  prefix="$(npm config get prefix 2>/dev/null || printf '')"
  registry="$(normalize_npm_registry "$(npm config get registry 2>/dev/null || printf '')")"
  shell_rc="$(detect_shell_rc)"

  if nvm_is_active; then
    if npmrc_has_prefix_conflict; then
      return 1
    fi
    [ "$registry" = 'https://registry.npmjs.org/' ]
    return $?
  fi

  if [ "$prefix" != "$HOME/.npm-global" ]; then
    return 1
  fi

  if [ "$registry" != 'https://registry.npmjs.org/' ]; then
    return 1
  fi

  if [[ ":$PATH:" == *":$HOME/.npm-global/bin:"* ]]; then
    return 0
  fi

  grep -Fq 'export PATH="$HOME/.npm-global/bin:$PATH"' "$shell_rc" 2>/dev/null
}

node_prefix_help() {
  local script_name="$1"
  cat <<EOF
Usage: $script_name [--check] [-upgrade] [-force] [--help]

Repo-owned self-hosted helper that ports the Unix npm prefix/PATH setup
behavior from environment-bootstrap into cats-platform.

Options:
  --check    Verify whether npm global installs are configured for this user.
  -upgrade   Re-apply the npm registry/prefix configuration.
  -force     Force a fresh rewrite of the npm registry/prefix configuration.
  --help     Show this help text.
EOF
}

run_node_prefix_setup() {
  local platform="$1"
  shift

  local check_only='false'
  local apply='false'
  local upgrade='false'
  local force='false'
  local emit_json='false'
  local shell_rc
  local prefix
  local registry
  local status='ready'
  local execution_mode='apply'
  local planned_actions=()
  local applied_changes=()

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
      --json|-Json)
        emit_json='true'
        ;;
      -h|--help)
        node_prefix_help "$(basename "$0")"
        return 0
        ;;
      *)
        printf 'Unknown option: %s\n' "$1" >&2
        node_prefix_help "$(basename "$0")" >&2
        return 1
        ;;
    esac
    shift
  done

  if [ "$force" = 'true' ]; then
    upgrade='false'
  fi

  if [ "$check_only" = 'true' ]; then
    execution_mode='check'
  elif [ "$force" = 'true' ]; then
    execution_mode='force'
  elif [ "$upgrade" = 'true' ]; then
    execution_mode='upgrade'
  else
    execution_mode='apply'
  fi

  load_nvm_if_present
  if ! ensure_node_and_npm; then
    if [ "$emit_json" = 'true' ]; then
      printf '{'
      printf '"helper":"%s-npm-prefix-helper",' "$platform"
      printf '"mode":"%s",' "$execution_mode"
      printf '"status":"failed",'
      printf '"restartRequired":false,'
      printf '"desiredPrefix":"%s",' "$(json_escape "$HOME/.npm-global")"
      printf '"shellRc":"%s",' "$(json_escape "$(detect_shell_rc)")"
      printf '"plannedActions":[],'
      printf '"appliedChanges":[],'
      printf '"warnings":[],'
      printf '"manualSteps":[],'
      printf '"interruptions":[]'
      printf '}\n'
    fi
    return 1
  fi

  shell_rc="$(detect_shell_rc)"
  prefix="$(npm config get prefix 2>/dev/null || printf '')"
  registry="$(normalize_npm_registry "$(npm config get registry 2>/dev/null || printf '')")"

  if nvm_is_active; then
    if npmrc_has_prefix_conflict; then
      planned_actions+=('clear_npm_prefix_conflict')
    fi
    if [ "$registry" != 'https://registry.npmjs.org/' ]; then
      planned_actions+=('set_npm_registry')
    fi
  else
    if [ "$prefix" != "$HOME/.npm-global" ]; then
      planned_actions+=('set_npm_prefix')
    fi
    if [ "$registry" != 'https://registry.npmjs.org/' ]; then
      planned_actions+=('set_npm_registry')
    fi
    if [[ ":$PATH:" != *":$HOME/.npm-global/bin:"* ]]; then
      planned_actions+=('repair_npm_global_path')
    fi
  fi

  if [ ${#planned_actions[@]} -gt 0 ]; then
    status='changes_required'
  fi

  if [ "$check_only" = 'true' ]; then
    if [ "$emit_json" = 'true' ]; then
      printf '{'
      printf '"helper":"%s-npm-prefix-helper",' "$platform"
      printf '"mode":"check",'
      printf '"status":"%s",' "$status"
      printf '"restartRequired":false,'
      printf '"desiredPrefix":"%s",' "$(json_escape "$HOME/.npm-global")"
      printf '"shellRc":"%s",' "$(json_escape "$shell_rc")"
      printf '"plannedActions":'
      json_string_array "${planned_actions[@]}"
      printf ','
      printf '"appliedChanges":[],'
      printf '"warnings":[],'
      printf '"manualSteps":[],'
      printf '"interruptions":[]'
      printf '}\n'
      return 0
    fi
    if node_prefix_ready; then
      printf 'npm global prefix is ready.\n'
      return 0
    fi
    printf 'npm global prefix is not ready.\n' >&2
    return 1
  fi

  if [ "$force" = 'false' ] && [ "$upgrade" = 'false' ] && node_prefix_ready; then
    if [ "$emit_json" = 'true' ]; then
      printf '{'
      printf '"helper":"%s-npm-prefix-helper",' "$platform"
      printf '"mode":"%s",' "$execution_mode"
      printf '"status":"ready",'
      printf '"restartRequired":false,'
      printf '"desiredPrefix":"%s",' "$(json_escape "$HOME/.npm-global")"
      printf '"shellRc":"%s",' "$(json_escape "$shell_rc")"
      printf '"plannedActions":[],'
      printf '"appliedChanges":[],'
      printf '"warnings":[],'
      printf '"manualSteps":[],'
      printf '"interruptions":[]'
      printf '}\n'
      return 0
    fi
    printf 'npm global prefix is already configured.\n'
    return 0
  fi

  if nvm_is_active; then
    nvm use --delete-prefix "$(node -v)" --silent >/dev/null 2>&1 || true
    npm config delete prefix >/dev/null 2>&1 || true
    npm config delete globalconfig >/dev/null 2>&1 || true
    npm config set registry 'https://registry.npmjs.org/'
    applied_changes+=('set_npm_registry')
    if npmrc_has_prefix_conflict; then
      applied_changes+=('clear_npm_prefix_conflict')
    fi
  else
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    npm config set registry 'https://registry.npmjs.org/'
    ensure_npm_global_path_export "$shell_rc"
    applied_changes+=('set_npm_prefix' 'set_npm_registry' 'repair_npm_global_path')
  fi

  prefix="$(npm config get prefix 2>/dev/null || printf '')"
  registry="$(normalize_npm_registry "$(npm config get registry 2>/dev/null || printf '')")"
  status='ready'
  if ! node_prefix_ready; then
    status='failed'
  fi
  if [ "$emit_json" = 'true' ]; then
    printf '{'
    printf '"helper":"%s-npm-prefix-helper",' "$platform"
    printf '"mode":"%s",' "$execution_mode"
    printf '"status":"%s",' "$status"
    printf '"restartRequired":false,'
    printf '"desiredPrefix":"%s",' "$(json_escape "$HOME/.npm-global")"
    printf '"shellRc":"%s",' "$(json_escape "$shell_rc")"
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
    if [ "$status" = 'failed' ]; then
      return 1
    fi
    return 0
  fi
  printf 'npm prefix: %s\n' "$prefix"
  printf 'npm registry: %s\n' "$registry"
  printf 'Reload your shell if PATH is stale: source %s\n' "$shell_rc"
}

node_cli_package_rows() {
  cat <<'EOF'
codex|codex|@openai/codex|OpenAI Codex
gemini|gemini|@google/gemini-cli|Gemini CLI
copilot|copilot|@github/copilot|GitHub Copilot CLI
opencode|opencode|opencode-ai|OpenCode
kilo|kilo|@kilocode/cli|Kilo Code CLI
auggie|auggie|@augmentcode/auggie|Auggie CLI
pi|pi|@mariozechner/pi-coding-agent|Pi CLI
EOF
}

node_cli_pack_help() {
  local script_name="$1"
  cat <<EOF
Usage: $script_name [--check] [-upgrade] [-force] [--skip-prefix-setup] [--help]

Repo-owned self-hosted helper for the shared npm-based CLI provider pack:
Codex, Gemini, Copilot, OpenCode, Kilo, Auggie, and Pi.

Options:
  --check             Verify whether the npm CLI pack is reachable on this host.
  -upgrade            Upgrade installed packages and install any missing package.
  -force              Reinstall every package in the pack.
  --skip-prefix-setup Skip the npm prefix/PATH helper.
  --help              Show this help text.
EOF
}

run_node_cli_pack() {
  local platform="$1"
  shift

  local check_only='false'
  local apply='false'
  local upgrade='false'
  local force='false'
  local skip_prefix_setup='false'
  local emit_json='false'
  local outdated_packages=''
  local row=''
  local id=''
  local command_name=''
  local package_name=''
  local display_name=''
  local installed='false'
  local installed_count=0
  local missing_count=0
  local changed_count=0
  local planned_actions=()
  local applied_changes=()
  local packages_json=''
  local first_package='true'
  local package_status=''
  local prefix_status='ready'

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
      --skip-prefix-setup)
        skip_prefix_setup='true'
        ;;
      --json|-Json)
        emit_json='true'
        ;;
      -h|--help)
        node_cli_pack_help "$(basename "$0")"
        return 0
        ;;
      *)
        printf 'Unknown option: %s\n' "$1" >&2
        node_cli_pack_help "$(basename "$0")" >&2
        return 1
        ;;
    esac
    shift
  done

  if [ "$force" = 'true' ]; then
    upgrade='false'
  fi

  load_nvm_if_present
  if ! ensure_node_and_npm; then
    if [ "$emit_json" = 'true' ]; then
      printf '{'
      printf '"helper":"%s-node-cli-pack",' "$platform"
      printf '"mode":"%s",' "$( [ "$check_only" = 'true' ] && printf 'check' || [ "$force" = 'true' ] && printf 'force' || [ "$upgrade" = 'true' ] && printf 'upgrade' || printf 'apply' )"
      printf '"status":"failed",'
      printf '"restartRequired":false,'
      printf '"plannedActions":[],'
      printf '"appliedChanges":[],'
      printf '"warnings":[],'
      printf '"manualSteps":[],'
      printf '"interruptions":[],'
      printf '"packages":[]'
      printf '}\n'
    fi
    return 1
  fi

  local execution_mode='apply'
  if [ "$check_only" = 'true' ]; then
    execution_mode='check'
  elif [ "$force" = 'true' ]; then
    execution_mode='force'
  elif [ "$upgrade" = 'true' ]; then
    execution_mode='upgrade'
  fi

  if [ "$skip_prefix_setup" = 'false' ] && [ "$check_only" = 'false' ]; then
    run_node_prefix_setup "$platform" -Apply >/dev/null || return 1
  elif [ "$skip_prefix_setup" = 'false' ] && ! node_prefix_ready; then
    prefix_status='changes_required'
  fi

  if nvm_is_active && npmrc_has_prefix_conflict && [ "$force" = 'false' ]; then
    printf 'Detected ~/.npmrc prefix/globalconfig conflict while nvm is active.\n' >&2
    printf 'Run setup-node-global-prefix.sh first or re-run with -force after review.\n' >&2
    return 1
  fi

  if [ "$upgrade" = 'true' ]; then
    outdated_packages="$(npm outdated -g --json 2>/dev/null || true)"
  fi

  while IFS='|' read -r id command_name package_name display_name; do
    [ -n "$id" ] || continue

    installed='false'
    local is_outdated='false'
    local planned_action='skip'
    if command -v "$command_name" >/dev/null 2>&1 || npm list -g "$package_name" --depth=0 >/dev/null 2>&1; then
      installed='true'
      installed_count=$((installed_count + 1))
    else
      missing_count=$((missing_count + 1))
    fi
    if [ "$upgrade" = 'true' ] && printf '%s' "$outdated_packages" | grep -qF "\"$package_name\""; then
      is_outdated='true'
    fi

    if [ "$check_only" = 'true' ]; then
      if [ "$installed" = 'true' ]; then
        printf '%s installed.\n' "$display_name"
      else
        printf '%s missing.\n' "$display_name" >&2
      fi
    elif [ "$force" = 'true' ]; then
      planned_action='reinstall'
      npm install -g "$package_name" --force
      changed_count=$((changed_count + 1))
      applied_changes+=("${package_name}:reinstall")
    elif [ "$upgrade" = 'true' ]; then
      if [ "$installed" = 'false' ]; then
        planned_action='install'
        npm install -g "$package_name"
        changed_count=$((changed_count + 1))
        applied_changes+=("${package_name}:install")
      elif [ "$is_outdated" = 'true' ]; then
        planned_action='upgrade'
        npm install -g "$package_name@latest"
        changed_count=$((changed_count + 1))
        applied_changes+=("${package_name}:upgrade")
      else
        printf '%s already up to date.\n' "$display_name"
      fi
    elif [ "$installed" = 'false' ]; then
      planned_action='install'
      npm install -g "$package_name"
      changed_count=$((changed_count + 1))
      applied_changes+=("${package_name}:install")
    else
      printf '%s already installed.\n' "$display_name"
    fi

    if [ "$planned_action" != 'skip' ]; then
      planned_actions+=("${package_name}:${planned_action}")
    fi

    if [ "$installed" = 'true' ] && [ "$is_outdated" = 'false' ]; then
      package_status='ready'
    else
      package_status='changes_required'
    fi
    if [ "$first_package" = 'false' ]; then
      packages_json="${packages_json},"
    fi
    first_package='false'
    packages_json="${packages_json}{\"id\":\"${id}\",\"label\":\"$(json_escape "$display_name")\",\"packageName\":\"$(json_escape "$package_name")\",\"installed\":$(json_bool "$installed"),\"outdated\":$(json_bool "$is_outdated"),\"plannedAction\":\"${planned_action}\",\"status\":\"${package_status}\"}"
  done <<EOF
$(node_cli_package_rows)
EOF

  local status='ready'
  if [ "$prefix_status" = 'changes_required' ] || [ $missing_count -gt 0 ]; then
    status='changes_required'
  fi

  if [ "$check_only" = 'true' ]; then
    if [ "$emit_json" = 'true' ]; then
      printf '{'
      printf '"helper":"%s-node-cli-pack",' "$platform"
      printf '"mode":"check",'
      printf '"status":"%s",' "$status"
      printf '"restartRequired":false,'
      printf '"plannedActions":'
      json_string_array "${planned_actions[@]}"
      printf ','
      printf '"appliedChanges":[],'
      printf '"warnings":[],'
      printf '"manualSteps":[],'
      printf '"interruptions":[],'
      printf '"packages":[%s]' "$packages_json"
      printf '}\n'
      return 0
    fi
    if [ $missing_count -eq 0 ]; then
      return 0
    fi
    return 1
  fi

  if [ "$emit_json" = 'true' ]; then
    printf '{'
    printf '"helper":"%s-node-cli-pack",' "$platform"
    printf '"mode":"%s",' "$execution_mode"
    printf '"status":"ready",'
    printf '"restartRequired":false,'
    printf '"plannedActions":'
    json_string_array "${planned_actions[@]}"
    printf ','
    printf '"appliedChanges":'
    json_string_array "${applied_changes[@]}"
    printf ','
    printf '"warnings":[],'
    printf '"manualSteps":[],'
    printf '"interruptions":[],'
    printf '"packages":[%s]' "$packages_json"
    printf '}\n'
    return 0
  fi
  printf 'npm CLI pack complete. changed=%s installed=%s missing=%s\n' "$changed_count" "$installed_count" "$missing_count"
}

run_self_hosted_installation_check() {
  local platform="$1"
  shift

  local emit_json='false'
  local strict='false'
  local total_present=0
  local total_missing=0
  local checks_json=''
  local first_json='true'
  local overall_status='ready'
  local prefix_status='missing'
  local core_present=0
  local core_missing=0
  local native_present=0
  local native_missing=0
  local node_pack_present=0
  local node_pack_missing=0
  local command_path=''
  local provider=''
  local row=''
  local id=''
  local command_name=''
  local package_name=''
  local display_name=''

  while [ $# -gt 0 ]; do
    case "$1" in
      --json|-Json)
        emit_json='true'
        ;;
      -CheckOnly)
        ;;
      --strict)
        strict='true'
        ;;
      -h|--help)
        cat <<EOF
Usage: $(basename "$0") [--json] [--strict] [--help]

Audits the self-hosted provider baseline needed to run cats-platform with
cats-runtime on ${platform}.

Options:
  --json    Emit a machine-readable summary.
  --strict  Exit non-zero when any audited item is missing.
  --help    Show this help text.
EOF
        return 0
        ;;
      *)
        printf 'Unknown option: %s\n' "$1" >&2
        return 1
        ;;
    esac
    shift
  done

  load_nvm_if_present

  if node_prefix_ready; then
    prefix_status='ready'
  fi

  if [ "$emit_json" = 'false' ]; then
    printf 'Self-hosted provider audit (%s)\n' "$platform"
    printf 'Node prefix: %s\n' "$prefix_status"
  fi

  append_check_json() {
    local check_id="$1"
    local label="$2"
    local present="$3"
    local kind="$4"
    local scope="$5"
    local status="$6"
    if [ "$first_json" = 'true' ]; then
      first_json='false'
    else
      checks_json="${checks_json},"
    fi
    checks_json="${checks_json}{\"id\":\"${check_id}\",\"label\":\"${label}\",\"kind\":\"${kind}\",\"scope\":\"${scope}\",\"present\":${present},\"status\":\"${status}\"}"
  }

  phase_status() {
    local missing_count="$1"
    if [ "$missing_count" -eq 0 ]; then
      printf 'ready'
    else
      printf 'changes_required'
    fi
  }

  if command -v node >/dev/null 2>&1; then
    total_present=$((total_present + 1))
    core_present=$((core_present + 1))
    [ "$emit_json" = 'false' ] && printf 'Node.js: present\n'
    append_check_json 'node' 'Node.js' 'true' 'core' 'host' 'ready'
  else
    total_missing=$((total_missing + 1))
    core_missing=$((core_missing + 1))
    [ "$emit_json" = 'false' ] && printf 'Node.js: missing\n'
    append_check_json 'node' 'Node.js' 'false' 'core' 'host' 'changes_required'
  fi

  if command -v npm >/dev/null 2>&1; then
    total_present=$((total_present + 1))
    core_present=$((core_present + 1))
    [ "$emit_json" = 'false' ] && printf 'npm: present\n'
    append_check_json 'npm' 'npm' 'true' 'core' 'host' 'ready'
  else
    total_missing=$((total_missing + 1))
    core_missing=$((core_missing + 1))
    [ "$emit_json" = 'false' ] && printf 'npm: missing\n'
    append_check_json 'npm' 'npm' 'false' 'core' 'host' 'changes_required'
  fi

  if command -v docker >/dev/null 2>&1; then
    total_present=$((total_present + 1))
    core_present=$((core_present + 1))
    [ "$emit_json" = 'false' ] && printf 'Docker: present\n'
    append_check_json 'docker' 'Docker' 'true' 'core' 'host' 'ready'
  else
    total_missing=$((total_missing + 1))
    core_missing=$((core_missing + 1))
    [ "$emit_json" = 'false' ] && printf 'Docker: missing\n'
    append_check_json 'docker' 'Docker' 'false' 'core' 'host' 'changes_required'
  fi

  if [ "$prefix_status" = 'ready' ]; then
    total_present=$((total_present + 1))
    core_present=$((core_present + 1))
    append_check_json 'node_prefix' 'npm global prefix' 'true' 'core' 'host' 'ready'
  else
    total_missing=$((total_missing + 1))
    core_missing=$((core_missing + 1))
    append_check_json 'node_prefix' 'npm global prefix' 'false' 'core' 'host' 'changes_required'
  fi

  for provider in claude cursor goose junie kiro; do
    if command_path="$(detect_provider_command "$platform" "$provider")"; then
      total_present=$((total_present + 1))
      native_present=$((native_present + 1))
      [ "$emit_json" = 'false' ] && printf '%s: present\n' "$(provider_display_name "$provider")"
      append_check_json "$provider" "$(provider_display_name "$provider")" 'true' 'native' 'host' 'ready'
      unset command_path
    else
      total_missing=$((total_missing + 1))
      native_missing=$((native_missing + 1))
      [ "$emit_json" = 'false' ] && printf '%s: missing\n' "$(provider_display_name "$provider")"
      append_check_json "$provider" "$(provider_display_name "$provider")" 'false' 'native' 'host' 'changes_required'
    fi
  done

  while IFS='|' read -r id command_name package_name display_name; do
    [ -n "$id" ] || continue
    if command -v "$command_name" >/dev/null 2>&1; then
      total_present=$((total_present + 1))
      node_pack_present=$((node_pack_present + 1))
      [ "$emit_json" = 'false' ] && printf '%s: present\n' "$display_name"
      append_check_json "$id" "$display_name" 'true' 'node' 'host' 'ready'
    else
      total_missing=$((total_missing + 1))
      node_pack_missing=$((node_pack_missing + 1))
      [ "$emit_json" = 'false' ] && printf '%s: missing\n' "$display_name"
      append_check_json "$id" "$display_name" 'false' 'node' 'host' 'changes_required'
    fi
  done <<EOF
$(node_cli_package_rows)
EOF

  if [ "$total_missing" -gt 0 ]; then
    overall_status='changes_required'
  fi

  if [ "$emit_json" = 'true' ]; then
    printf '{"helper":"self-hosted-cli-check","platform":"%s","status":"%s","ready":%s,"present":%s,"missing":%s,"checks":[%s],"phases":[{"id":"core","label":"Core prerequisites","status":"%s","present":%s,"missing":%s},{"id":"native_provider_pack","label":"Native provider pack","status":"%s","present":%s,"missing":%s},{"id":"node_cli_pack","label":"Node CLI pack","status":"%s","present":%s,"missing":%s}],"warnings":[]}\n' \
      "$platform" \
      "$overall_status" \
      "$( [ $total_missing -eq 0 ] && printf 'true' || printf 'false' )" \
      "$total_present" \
      "$total_missing" \
      "$checks_json" \
      "$(phase_status "$core_missing")" \
      "$core_present" \
      "$core_missing" \
      "$(phase_status "$native_missing")" \
      "$native_present" \
      "$native_missing" \
      "$(phase_status "$node_pack_missing")" \
      "$node_pack_present" \
      "$node_pack_missing"
  else
    printf 'Status: %s\n' "$overall_status"
    printf 'Core prerequisites: %s (present=%s missing=%s)\n' "$(phase_status "$core_missing")" "$core_present" "$core_missing"
    printf 'Native provider pack: %s (present=%s missing=%s)\n' "$(phase_status "$native_missing")" "$native_present" "$native_missing"
    printf 'Node CLI pack: %s (present=%s missing=%s)\n' "$(phase_status "$node_pack_missing")" "$node_pack_present" "$node_pack_missing"
    printf 'Summary: present=%s missing=%s\n' "$total_present" "$total_missing"
  fi

  if [ "$strict" = 'true' ] || [ "$emit_json" = 'false' ]; then
    [ $total_missing -eq 0 ]
    return $?
  fi

  return 0
}
