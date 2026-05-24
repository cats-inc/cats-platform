#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

print_usage() {
  cat <<'EOF'
Usage: upgrade-cli-tools.sh [--skip-node] [--help]

Repo-owned self-hosted bulk upgrade helper for the Unix provider baseline.

Options:
  --skip-node  Skip the npm CLI pack upgrade pass.
  --help       Show this help text.
EOF
}

skip_node='false'

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-node)
      skip_node='true'
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
  shift
done

for script_name in install-claude-code.sh install-antigravity.sh install-cursor-agent.sh install-goose.sh install-junie.sh install-kiro-cli.sh; do
  "$SCRIPT_DIR/$script_name" -Upgrade
done

if [ "$skip_node" = 'false' ]; then
  for script_name in install-codex.sh install-copilot.sh install-opencode.sh install-kilo.sh install-auggie.sh install-pi.sh; do
    "$SCRIPT_DIR/$script_name" -upgrade
  done
fi
