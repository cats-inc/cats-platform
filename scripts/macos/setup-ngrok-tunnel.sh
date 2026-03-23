#!/bin/bash
#
# Configure cats + ngrok auto-start on macOS.
#
# Usage: ./setup-ngrok-tunnel.sh <install|verify|remove> [--force]
#

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./setup-ngrok-tunnel.sh <install|verify|remove> [--force]

Commands:
  install    Build cats, create a login runner, and enable auto-start
  verify     Show runner / auto-start / ngrok status
  remove     Remove auto-start and stop the managed cats + ngrok processes

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

APP_SUPPORT_DIR="$HOME/Library/Application Support/cats"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
STATE_DIR="$APP_SUPPORT_DIR/state"
RUNNER_SCRIPT="$APP_SUPPORT_DIR/start-cats-ngrok-tunnel.sh"
PLIST_FILE="$LAUNCH_AGENTS_DIR/io.cats.ngrok-tunnel.plist"
SERVER_PID_FILE="$STATE_DIR/cats-server.pid"
NGROK_PID_FILE="$STATE_DIR/cats-ngrok.pid"
RUNNER_LOG="$STATE_DIR/cats-ngrok-tunnel.log"

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

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name command not found." >&2
    exit 1
  fi
}

require_prerequisites() {
  require_command ngrok
  require_command node
  require_command npm
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

query_ngrok_api() {
  curl --silent --fail --max-time 3 "http://127.0.0.1:4040/api/tunnels" || true
}

create_runner() {
  mkdir -p "$APP_SUPPORT_DIR" "$STATE_DIR" "$LAUNCH_AGENTS_DIR"

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
NGROK_PID_FILE="$NGROK_PID_FILE"
RUNNER_LOG="$RUNNER_LOG"

mkdir -p "\$STATE_DIR"

if [[ -f "\$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\$ENV_FILE"
  set +a
fi

PORT="\${CATS_PORT:-\${CATS_INC_PORT:-8181}}"
AUTHTOKEN="\${CATS_NGROK_AUTHTOKEN:-\${NGROK_AUTHTOKEN:-}}"
DOMAIN="\${CATS_NGROK_DOMAIN:-\${NGROK_DOMAIN:-}}"

{
  echo ""
  echo "=== [\$(date '+%Y-%m-%d %H:%M:%S')] Starting cats + ngrok ==="
} >>"\$RUNNER_LOG"

if ! curl --silent --fail --max-time 3 "http://127.0.0.1:\$PORT/health" >/dev/null 2>&1; then
  (
    cd "\$PROJECT_ROOT"
    nohup npm start >>"\$STATE_DIR/cats-server.out" 2>>"\$STATE_DIR/cats-server.err" < /dev/null &
    echo \$! >"\$SERVER_PID_FILE"
  )
  sleep 5
fi

if [[ -f "\$NGROK_PID_FILE" ]]; then
  EXISTING_PID="\$(cat "\$NGROK_PID_FILE")"
  if [[ -n "\$EXISTING_PID" ]] && kill -0 "\$EXISTING_PID" >/dev/null 2>&1; then
    exit 0
  fi
  rm -f "\$NGROK_PID_FILE"
fi

ARGS=(http "http://127.0.0.1:\$PORT" --log=stdout --log-format=logfmt --log-level=info)
if [[ -n "\$AUTHTOKEN" ]]; then
  ARGS+=("--authtoken=\$AUTHTOKEN")
fi
if [[ -n "\$DOMAIN" ]]; then
  ARGS+=("--domain=\$DOMAIN")
fi

nohup ngrok "\${ARGS[@]}" >>"\$STATE_DIR/cats-ngrok.out" 2>>"\$STATE_DIR/cats-ngrok.err" < /dev/null &
echo \$! >"\$NGROK_PID_FILE"
EOF

  chmod +x "$RUNNER_SCRIPT"

  cat >"$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>io.cats.ngrok-tunnel</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>$RUNNER_SCRIPT</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
  </dict>
</plist>
EOF
}

stop_managed_processes() {
  if [[ -f "$NGROK_PID_FILE" ]]; then
    local pid
    pid="$(cat "$NGROK_PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$NGROK_PID_FILE"
  fi

  if [[ -f "$SERVER_PID_FILE" ]]; then
    local server_pid
    server_pid="$(cat "$SERVER_PID_FILE")"
    if [[ -n "$server_pid" ]] && kill -0 "$server_pid" >/dev/null 2>&1; then
      kill "$server_pid" >/dev/null 2>&1 || true
    fi
    rm -f "$SERVER_PID_FILE"
  fi
}

load_launch_agent() {
  launchctl unload "$PLIST_FILE" >/dev/null 2>&1 || true
  launchctl load "$PLIST_FILE"
}

unload_launch_agent() {
  launchctl unload "$PLIST_FILE" >/dev/null 2>&1 || true
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

if [[ "$COMMAND" == 'verify' ]]; then
  echo '--- cats ngrok auto-start helper ---'
  echo "Runner script: $RUNNER_SCRIPT"
  echo "LaunchAgent plist: $PLIST_FILE"
  if [[ -f "$RUNNER_SCRIPT" ]]; then
    echo 'Runner script exists.'
  else
    echo 'Runner script is missing.'
  fi
  if [[ -f "$PLIST_FILE" ]]; then
    echo 'LaunchAgent plist exists.'
  else
    echo 'LaunchAgent plist is missing.'
  fi
  API_TEXT="$(query_ngrok_api)"
  if [[ -n "$API_TEXT" ]]; then
    echo 'ngrok API is responding on http://127.0.0.1:4040/api/tunnels.'
  else
    echo 'ngrok API is not responding.'
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
  stop_managed_processes
  unload_launch_agent
  rm -f "$RUNNER_SCRIPT" "$PLIST_FILE" "$RUNNER_LOG" "$STATE_DIR/cats-server.out" "$STATE_DIR/cats-server.err" "$STATE_DIR/cats-ngrok.out" "$STATE_DIR/cats-ngrok.err"
  echo 'Removed cats ngrok auto-start configuration.'
  exit 0
fi

require_prerequisites
ensure_env_file
ensure_build

if [[ -f "$RUNNER_SCRIPT" || -f "$PLIST_FILE" ]] && [[ "$FORCE" != 'true' ]]; then
  echo 'Auto-start configuration already exists. Use --force to recreate it.'
  exit 0
fi

create_runner
load_launch_agent
run_runner_now

echo 'Installed cats ngrok auto-start configuration.'
echo "Runner script: $RUNNER_SCRIPT"
echo "LaunchAgent plist: $PLIST_FILE"
