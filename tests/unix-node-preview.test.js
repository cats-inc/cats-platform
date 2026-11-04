import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(callback);
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const options = { skip: process.platform === 'win32' && !existsSync(bash) };
const shellPath = value => value.replaceAll('\\', '/').replace(/^([a-z]):/iu, (_, drive) => '/' + drive.toLowerCase());

for (const platform of ['macos', 'linux']) {
  for (const scenario of ['apply-existing-nvm', 'upgrade-existing-nvm', 'force-existing-nvm', 'apply-no-nvm', 'upgrade-no-nvm', 'force-no-nvm', 'already-installed']) {
    test(`${platform} Node ${scenario} preview invokes neither curl nor nvm mutation`, options, async t => {
      const root = await mkdtemp(join(tmpdir(), "cats-node-preview Owner's Temp-"));
      t.after(() => rm(root, { recursive: true, force: true }));
      const home = join(root, 'home'), nvm = join(home, '.nvm'), marker = join(root, 'mutation.txt');
      await mkdir(home);
      if (scenario.endsWith('existing-nvm')) {
        await mkdir(nvm);
        await writeFile(join(nvm, 'nvm.sh'), `nvm() { printf 'nvm mutation\\n' >> "$CATS_PREVIEW_MARKER"; return 92; }\n`);
      }
      const wrapper = join(root, 'entry.sh');
      await writeFile(wrapper, `#!/usr/bin/env bash
set -euo pipefail
curl() { printf 'curl mutation\\n' >> "$CATS_PREVIEW_MARKER"; return 91; }
node() { printf 'v99.0.0\\n'; }
npm() { printf '99.0.0\\n'; }
export -f curl node npm
exec "$BASH" "$CATS_NODE_HELPER" "$@"
`);
      const mode = scenario === 'already-installed' ? '--apply' : { apply: '--apply', upgrade: '-Upgrade', force: '-Force' }[scenario.split('-')[0]];
      const { stdout } = await execFile(bash, ['--noprofile', '--norc', shellPath(wrapper), mode, '--dry-run', '--json', '--install-state', scenario === 'already-installed' ? 'installed' : 'missing', '--detected-version', '99.0.0'], {
        env: { ...process.env, HOME: shellPath(home), NVM_DIR: shellPath(nvm), CATS_PREVIEW_MARKER: shellPath(marker), CATS_NODE_HELPER: shellPath(join(process.cwd(), `scripts/${platform}/install-node.sh`)) },
        windowsHide: true, encoding: 'utf8', timeout: 15000,
      });
      const result = JSON.parse(stdout);
      assert.equal(result.status, 'preview');
      assert.deepEqual(result.appliedChanges, []);
      assert.equal(result.plannedActions.length, scenario === 'already-installed' ? 0 : 1);
      assert.equal(existsSync(marker), false);
      if (scenario.endsWith('no-nvm')) assert.equal(existsSync(nvm), false);
    });
  }
}
