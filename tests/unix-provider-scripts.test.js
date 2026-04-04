import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const rootDir = process.cwd();

const linuxScripts = [
  'setup-node-global-prefix.sh',
  'install-node-cli-tools.sh',
  'install-claude-code.sh',
  'install-cursor-agent.sh',
  'install-goose.sh',
  'install-junie.sh',
  'install-kiro-cli.sh',
  'upgrade-cli-tools.sh',
  'check-installation.sh',
];

const macosScripts = [
  'setup-node-global-prefix.sh',
  'install-node-cli-tools.sh',
  'install-claude-code.sh',
  'install-cursor-agent.sh',
  'install-goose.sh',
  'install-junie.sh',
  'install-kiro-cli.sh',
  'upgrade-cli-tools.sh',
  'check-installation.sh',
];

async function assertHelp(scriptPath) {
  const { stdout } = await execFile('bash', [scriptPath, '--help'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(stdout, /Usage:/u);
}

test('cats-platform ships repo-owned Unix self-hosted provider helpers', async () => {
  for (const scriptName of linuxScripts) {
    const script = await readFile(join(rootDir, 'scripts', 'linux', scriptName), 'utf8');
    assert.match(script, /^#!\/usr\/bin\/env bash/u);
  }

  for (const scriptName of macosScripts) {
    const script = await readFile(join(rootDir, 'scripts', 'macos', scriptName), 'utf8');
    assert.match(script, /^#!\/usr\/bin\/env bash/u);
  }

  const readme = await readFile(join(rootDir, 'scripts', 'README.md'), 'utf8');
  assert.match(readme, /scripts\/linux\/install-node-cli-tools\.sh/u);
  assert.match(readme, /scripts\/macos\/install-node-cli-tools\.sh/u);
  assert.match(readme, /scripts\/linux\/upgrade-cli-tools\.sh/u);
  assert.match(readme, /scripts\/macos\/upgrade-cli-tools\.sh/u);
});

test('Unix self-hosted provider helpers expose help text without mutating the host', async () => {
  for (const platform of ['linux', 'macos']) {
    await assertHelp(join(rootDir, 'scripts', platform, 'setup-node-global-prefix.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-node-cli-tools.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-claude-code.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-cursor-agent.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-goose.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-junie.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-kiro-cli.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'upgrade-cli-tools.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'check-installation.sh'));
  }
});
