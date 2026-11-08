import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(callback);
const unix = { skip: process.platform === 'win32' };
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

async function fixture(t, platform, { policy = true, output = 'fixture 3.0.74', exit = 0,
  config = policy ? '{"allow-scripts":[]}' : '{}', installedVersion = '3.0.74' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-npm-provider-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'bin/fixture_cli'), `#!/bin/bash\nprintf '%s\\n' ${quote(output)}\nexit ${exit}\n`, { mode: 0o755 });
  const entry = join(root, 'entry.sh');
  await writeFile(entry, `#!/bin/bash
set -euo pipefail
export HOME=${quote(root)}
export PATH="$HOME/bin:$PATH"
. ${quote(join(process.cwd(), `scripts/${platform}/node-cli-common.sh`))}
load_nvm_if_present() { :; }
remove_superseded_npm_packages() { :; }
npm() {
  case "$1" in
    view) printf '3.0.74' ;;
    list) printf '%s' ${quote(JSON.stringify({ dependencies: { fixture: { version: installedVersion } } }))} ;;
    config) [ "$*" = 'config list --long --json' ] || return 95; printf '%s' ${quote(config)} ;;
    install) node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "$@" > "$HOME/install.json" ;;
    *) return 96 ;;
  esac
}
run_npm_cli_provider ${platform} fixture fixture fixture_cli Fixture -force --json
`);
  let result;
  try { result = { ...await execFile('/bin/bash', [entry], { timeout: 45000 }), code: 0 }; }
  catch (error) { result = error; }
  return { ...result, args: await readFile(join(root, 'install.json'), 'utf8').then(JSON.parse, () => null) };
}

for (const platform of ['linux', 'macos']) {
  for (const policy of [true, false]) {
    test(`${platform} Repair uses npm engine policy with ${policy ? 'one-off exact approval' : 'older npm'}`, unix, async t => {
      const result = await fixture(t, platform, { policy });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, 'ready');
      assert.deepEqual(result.args, ['install', '-g', '--include=optional', '--fetch-retries=0',
        '--fetch-timeout=30000', 'fixture@3.0.74', ...(policy ? ['--allow-scripts=fixture@3.0.74'] : [])]);
    });
  }
  for (const options of [{ output: '' }, { output: 'fixture 3.0.73' }, { exit: 7 }, { installedVersion: '3.0.73' }]) {
    test(`${platform} Repair rejects broken or stale binaries ${JSON.stringify(options)}`, unix, async t => {
      const result = await fixture(t, platform, options);
      assert.notEqual(result.code, 0);
      assert.equal(result.stdout.trim(), '');
      assert.match(result.stderr, /could not run|verification failed/u);
    });
  }
  test(`${platform} invalid npm policy fails before installation`, unix, async t => {
    const result = await fixture(t, platform, { config: 'not JSON' });
    assert.notEqual(result.code, 0);
    assert.equal(result.args, null);
  });
}
