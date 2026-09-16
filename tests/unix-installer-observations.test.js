import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(callback);
const bashPath = (s) => s.replaceAll('\\', '/').replace(/^([a-z]):\//i, (_, drive) => `/mnt/${drive.toLowerCase()}/`);
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
async function run(platform, body) {
  const dir = await mkdtemp(join(tmpdir(), 'cats-unix-observation-'));
  const script = join(dir, 'fixture.sh');
  await writeFile(script, `#!/usr/bin/env bash\nset -euo pipefail\nexport HOME=${quote(bashPath(dir) + '/home')}\nmkdir -p "$HOME"\n. ${quote(bashPath(join(process.cwd(), `scripts/${platform}/node-cli-common.sh`)))}\n${body}\n`);
  return execFile('bash', [bashPath(script)], { timeout: 30000 });
}

test('Unix native gate handles versions and leaves metadata failures unknown', async () => {
  for (const platform of ['linux', 'macos']) {
    const { stdout } = await run(platform, `
cats_native_version_state grok '2.0.0' '1.0.0'; echo
cats_native_version_state cursor '2026.09.16-abcd' '2026.09.16-defg'; echo
cats_native_version_state junie 'junie 1.0 (252.3.7)' '252.3.6'; echo
cats_native_version_state devin '1.2.3' ''`);
    assert.deepEqual(stdout.trim().split('\n'), ['current', 'older', 'current', 'unknown']);
  }
});

test('Unix version cleanup rejects parent traversal and keeps current and newer builds', async () => {
  for (const platform of ['linux', 'macos']) {
    await run(platform, `
export JUNIE_DATA_DIR="$HOME/../outside"
mkdir -p "$JUNIE_DATA_DIR/versions/1.0.0" "$JUNIE_DATA_DIR/versions/2.0.0"
ln -s versions/2.0.0 "$JUNIE_DATA_DIR/current"
cats_cleanup_native_versions junie 'junie 1.0 (2.0.0)'
test -d "$JUNIE_DATA_DIR/versions/1.0.0"
export JUNIE_DATA_DIR="$HOME/junie"
mkdir -p "$JUNIE_DATA_DIR/versions/1.0.0" "$JUNIE_DATA_DIR/versions/2.0.0" "$JUNIE_DATA_DIR/versions/3.0.0"
ln -s versions/2.0.0 "$JUNIE_DATA_DIR/current"
cats_cleanup_native_versions junie 'junie 1.0 (2.0.0)'
test ! -d "$JUNIE_DATA_DIR/versions/1.0.0"
test -d "$JUNIE_DATA_DIR/versions/2.0.0"
test -d "$JUNIE_DATA_DIR/versions/3.0.0"`);
  }
});

const npmFixture = `
load_nvm_if_present() { :; }
fixture_cli() { :; }
node() { cat >/dev/null; printf '%s\\n' "$fixture_version"; }
npm() {
 case "$1" in
  list) printf '{"dependencies":{"fixture":{"version":"%s"}}}\\n' "$fixture_version" ;;
  view) printf '2.0.0\\n' ;;
  *) printf 'Unexpected npm mutation: %s\\n' "$*" >&2; return 91 ;;
 esac
}
cats_upgrade_npm() { :; }
remove_superseded_npm_packages() { printf 'Unexpected removal\\n' >&2; return 92; }
fixture_version=3.0.0
`;

test('Unix GitHub CLI detects its local install with a clean Desktop PATH', async () => {
  for (const platform of ['linux', 'macos']) {
    const helper = quote(bashPath(join(process.cwd(), `scripts/${platform}/install-github-cli.sh`)));
    const { stdout } = await run(platform, `
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\\nprintf "gh version 2.0.0\\\\n"\\n' > "$HOME/.local/bin/gh"
chmod +x "$HOME/.local/bin/gh"
PATH=/usr/bin:/bin bash ${helper} --check --json`);
    const result = JSON.parse(stdout);
    assert.equal(result.status, 'ready');
    assert.equal(result.detectedVersion, '2.0.0');
    assert.match(result.commandPath, /\.local\/bin\/gh$/);
  }
});

test('Unix Node checks load an existing nvm installation and require npm as well', async () => {
  for (const platform of ['linux', 'macos']) {
    const helper = quote(bashPath(join(process.cwd(), `scripts/${platform}/install-node.sh`)));
    const { stdout } = await run(platform, `
mkdir -p "$HOME/.nvm"
cat > "$HOME/.nvm/nvm.sh" <<'NVM'
node() { printf 'v24.0.0'; }
npm() { printf '10.0.0'; }
# Keep system-installed commands outside this deterministic fixture's answer.
command() {
 if [ "$1" = '-v' ] && [ "$2" = 'npm' ] && [ -f "$NVM_DIR/no-npm" ]; then return 1; fi
 builtin command "$@"
}
NVM
NVM_DIR="$HOME/.nvm" bash ${helper} --check --json
touch "$HOME/.nvm/no-npm"
NVM_DIR="$HOME/.nvm" bash ${helper} --check --json`);
    const results = stdout.match(/\{[\s\S]*?\n\}/g).map((value) => JSON.parse(value));
    assert.equal(results[0].status, 'ready');
    assert.equal(results[0].detectedVersion, '24.0.0');
    assert.equal(results[1].status, 'changes_required');
  }
});

test('Unix npm dry runs never query or mutate and upgrades preserve newer local versions', async () => {
  for (const platform of ['linux', 'macos']) {
    let result = await run(platform, `${npmFixture}
run_npm_cli_provider ${platform} fixture fixture fixture_cli Fixture -upgrade --json`);
    assert.equal(JSON.parse(result.stdout).status, 'ready');
    result = await run(platform, `${npmFixture}
cats_upgrade_npm() { return 93; }
npm() { [ "$1" = list ] || return 94; printf '{}'; }
run_npm_cli_provider ${platform} fixture fixture fixture_cli Fixture -force --dry-run --json`);
    assert.equal(JSON.parse(result.stdout).status, 'preview');
  }
});

test('Unix prefix preparation preserves an existing user-owned npm prefix', async () => {
  for (const platform of ['linux', 'macos']) {
    const { stdout } = await run(platform, `
mkdir -p "$HOME/custom-npm/bin"
load_nvm_if_present() { :; }
node() { :; }
npm() {
 case "$*" in
  'config get prefix') printf '%s' "$HOME/custom-npm" ;;
  'config get registry') printf 'https://registry.npmjs.org/' ;;
  *) return 95 ;;
 esac
}
run_node_prefix_setup ${platform} --check --json`);
    const result = JSON.parse(stdout);
    assert.equal(result.status, 'ready');
    assert.match(result.desiredPrefix, /custom-npm$/);
  }
});

test('Unix explicit external npm prefix is retained even before its directory exists', async () => {
  for (const platform of ['linux', 'macos']) {
    const { stdout } = await run(platform, `
export NPM_CONFIG_PREFIX="$HOME/../external-not-created"
npm() { printf '%s' "$NPM_CONFIG_PREFIX"; }
preferred_npm_prefix`);
    assert.match(stdout.trim(), /external-not-created$/);
  }
});

test('Unix legacy Pi command plans replacement without removing anything in preview', async () => {
  for (const platform of ['linux', 'macos']) {
    const { stdout } = await run(platform, `
load_nvm_if_present() { :; }
fixture_cli() { :; }
node() { cat >/dev/null; }
npm() {
 case "$*" in
  'config get prefix') printf '%s' "$HOME/.npm-global" ;;
  'list -g --depth=0 --json @earendil-works/pi-coding-agent') printf '{}'; return 1 ;;
  'list -g @mariozechner/pi-coding-agent --depth=0') return 0 ;;
  *) return 96 ;;
 esac
}
remove_superseded_npm_packages() { return 97; }
run_npm_cli_provider ${platform} pi @earendil-works/pi-coding-agent fixture_cli Pi --dry-run --json`);
    assert.deepEqual(JSON.parse(stdout).plannedActions, ['@earendil-works/pi-coding-agent:install']);
  }
});

test('Unix failed installer remains failed even when its previous command still exists', async () => {
  for (const platform of ['linux', 'macos']) {
    const { stdout } = await run(platform, `
detect_provider_command() { printf '/fixture/cli'; }
provider_version_line() { printf '1.0.0'; }
run_provider_install_action() { return 17; }
run_native_provider_installer ${platform} grok --force --json || test "$?" = 1`);
    const result = JSON.parse(stdout);
    assert.equal(result.installed, true);
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.appliedChanges, []);
  }
});
