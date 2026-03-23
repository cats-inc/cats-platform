#!/bin/bash
#
# Configure cats + Tailscale Funnel auto-start on Linux.
#
# Usage: ./setup-tailscale-funnel.sh <install|verify|remove> [--force]
#

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./setup-tailscale-funnel.sh <install|verify|remove> [--force]

Commands:
  install    Build cats, create a login runner, and enable auto-start
  verify     Show runner / auto-start / tunnel status
  remove     Remove auto-start and stop the managed cats + Funnel processes

Options:
  --force    Recreate runner and auto-start files even if they already exist
  -h, --help Show this help message
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.example"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Neither .env nor .env.example was found." >&2
  exit 1
fi

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/cats"
RUNNER_DIR="$HOME/.local/bin/cats"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
RUNNER_SCRIPT="$RUNNER_DIR/start-cats-tailscale-funnel.sh"
AUTOSTART_FILE="$AUTOSTART_DIR/cats-tailscale-funnel.desktop"
SERVER_PID_FILE="$STATE_DIR/cats-server.pid"
RUNNER_LOG="$STATE_DIR/cats-tailscale-funnel.log"

read_env_value() {
  local name="$1"
  local value
  value="$(grep -E "^[[:space:]]*${name}=" "$ENV_FILE" | head -n 1 | cut -d '=' -f 2- || true)"
  echo "${value#"${value%%[![:space:]]*}"}" | sed 's/[[:space:]]*$//'
}

cats_port() {
  local value
  value="$(read_env_value CATS_PORT)"
  if [[ -z "$value" ]]; then
    value="$(read_env_value CATS_INC_PORT)"
  fi
  if [[ -z "$value" ]]; then
    value="8181"
  fi
  printf '%s' "$value"
}

https_port() {
  read_env_value TAILSCALE_HTTPS_PORT
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name command not found." >&2
    exit 1
  fi
}

require_prerequisites() {
  require_command tailscale
  require_command node
  require_command npm
  if ! tailscale status >/dev/null 2>&1; then
    echo 'Tailscale is not connected. Run "tailscale up" first.' >&2
    exit 1
  fi
}

ensure_env_file() {
  if [[ ! -f "$PROJECT_ROOT/.env" && -f "$PROJECT_ROOT/.env.example" ]]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    ENV_FILE="$PROJECT_ROOT/.env"
  fi
}

ensure_build() {
  cd "$PROJECT_ROOT"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run build
}

funnel_status() {
  tailscale funnel status 2>/dev/null || true
}

has_target() {
  local status_text="$1"
  local port="$2"
  grep -Eq "(127\\.0\\.0\\.1|localhost):${port}\b" <<<"$status_text"
}

public_url() {
  local status_text="$1"
  grep -Eo 'https://[^[:space:]]+\.ts\.net(:[0-9]+)?' <<<"$status_text" | head -n 1 || true
}

https_port_from_url() {
  local url="$1"
  if [[ -z "$url" ]]; then
    printf '443'
    return
  fi
  if [[ "$url" =~ :([0-9]+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  printf '443'
}

create_runner() {
  mkdir -p "$RUNNER_DIR" "$STATE_DIR" "$AUTOSTART_DIR"

  cat >"$RUNNER_SCRIPT" <<EOF
#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$PROJECT_ROOT"
ENV_FILE="$PROJECT_ROOT/.env"
if [[ ! -f "\$ENV_FILE" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.example"
fi
STATE_DIR="$STATE_DIR"
SERVER_PID_FILE="$SERVER_PID_FILE"
RUNNER_LOG="$RUNNER_LOG"

mkdir -p "\$STATE_DIR"

if [[ -f "\$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\$ENV_FILE"
  set +a
fi

PORT="\${CATS_PORT:-\${CATS_INC_PORT:-8181}}"
HTTPS_PORT="\${TAILSCALE_HTTPS_PORT:-}"

{
  echo ""
  echo "=== [\$(date '+%Y-%m-%d %H:%M:%S')] Starting cats + Tailscale Funnel ==="
} >>"\$RUNNER_LOG"

if ! curl --silent --fail --max-time 3 "http://127.0.0.1:\$PORT/health" >/dev/null 2>&1; then
  (
    cd "\$PROJECT_ROOT"
    nohup npm start >>"\$STATE_DIR/cats-server.out" 2>>"\$STATE_DIR/cats-server.err" < /dev/null &
    echo \$! >"\$SERVER_PID_FILE"
  )
  sleep 5
fi

if tailscale status >/dev/null 2>&1; then
  STATUS_TEXT="\$(tailscale funnel status 2>/dev/null || true)"
  if ! grep -Eq "(127\\\\.0\\\\.0\\\\.1|localhost):\${PORT}\\\\b" <<<"\$STATUS_TEXT"; then
    if [[ -n "\$HTTPS_PORT" ]]; then
      tailscale funnel --bg "--https=\$HTTPS_PORT" "http://127.0.0.1:\$PORT" >>"\$RUNNER_LOG" 2>&1 || true
    else
      tailscale funnel --bg "http://127.0.0.1:\$PORT" >>"\$RUNNER_LOG" 2>&1 || true
    fi
  fi
fi
EOF

  chmod +x "$RUNNER_SCRIPT"

  cat >"$AUTOSTART_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Cats Tailscale Funnel
Comment=Start cats and ensure Tailscale Funnel is available
Exec=/bin/bash $RUNNER_SCRIPT
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
}

stop_managed_server() {
  if [[ -f "$SERVER_PID_FILE" ]]; then
    local pid
    pid="$(cat "$SERVER_PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$SERVER_PID_FILE"
  fi
}

run_runner_now() {
  /bin/bash "$RUNNER_SCRIPT"
}

COMMAND="${1:-}"
FORCE='false'
if [[ "${2:-}" == '--force' ]]; then
  FORCE='true'
fi

case "$COMMAND" in
  install|verify|remove) ;;
  -h|--help|'')
    usage
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac

PORT="$(cats_port)"
HTTPS_PORT_VALUE="$(https_port)"

if [[ "$COMMAND" == 'verify' ]]; then
  echo '--- cats Tailscale auto-start helper ---'
  echo "Runner script: $RUNNER_SCRIPT"
  echo "Autostart file: $AUTOSTART_FILE"
  if [[ -f "$RUNNER_SCRIPT" ]]; then
    echo 'Runner script exists.'
  else
    echo 'Runner script is missing.'
  fi
  if [[ -f "$AUTOSTART_FILE" ]]; then
    echo 'Autostart file exists.'
  else
    echo 'Autostart file is missing.'
  fi
  STATUS_TEXT="$(funnel_status)"
  if has_target "$STATUS_TEXT" "$PORT"; then
    URL="$(public_url "$STATUS_TEXT")"
    echo "Funnel is configured for cats on port $PORT."
    if [[ -n "$URL" ]]; then
      echo "Public URL: $URL"
    fi
  else
    echo "No Funnel is currently configured for cats on port $PORT."
  fi
  if command -v curl >/dev/null 2>&1; then
    if curl --silent --fail --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null; then
      echo "Local cats server is responding on http://127.0.0.1:$PORT/health."
    else
      echo "Local cats server is not responding yet."
    fi
  fi
  exit 0
fi

if [[ "$COMMAND" == 'remove' ]]; then
  STATUS_TEXT="$(funnel_status)"
  if has_target "$STATUS_TEXT" "$PORT"; then
    URL="$(public_url "$STATUS_TEXT")"
    EFFECTIVE_HTTPS_PORT="$HTTPS_PORT_VALUE"
    if [[ -z "$EFFECTIVE_HTTPS_PORT" ]]; then
      EFFECTIVE_HTTPS_PORT="$(https_port_from_url "$URL")"
    fi
    tailscale funnel "--https=$EFFECTIVE_HTTPS_PORT" --set-path=/ off >/dev/null 2>&1 || true
  fi
  stop_managed_server
  rm -f "$RUNNER_SCRIPT" "$AUTOSTART_FILE" "$RUNNER_LOG" "$STATE_DIR/cats-server.out" "$STATE_DIR/cats-server.err"
  echo 'Removed cats Tailscale auto-start configuration.'
  exit 0
fi

require_prerequisites
ensure_env_file
ensure_build

if [[ -f "$RUNNER_SCRIPT" || -f "$AUTOSTART_FILE" ]] && [[ "$FORCE" != 'true' ]]; then
  echo 'Auto-start configuration already exists. Use --force to recreate it.'
  exit 0
fi

create_runner
run_runner_now

echo 'Installed cats Tailscale auto-start configuration.'
echo "Runner script: $RUNNER_SCRIPT"
echo "Autostart file: $AUTOSTART_FILE"
