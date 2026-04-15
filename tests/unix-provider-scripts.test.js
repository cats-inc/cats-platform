import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
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
  const bashPath = relative(rootDir, scriptPath).replace(/\\/gu, '/');
  const { stdout } = await execFile('bash', [bashPath, '--help'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(stdout, /Usage:/u);
}

async function readJsonSummary(scriptPath, extraArgs = []) {
  const bashPath = relative(rootDir, scriptPath).replace(/\\/gu, '/');
  const { stdout } = await execFile('bash', [bashPath, '--json', ...extraArgs], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
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

test('Unix self-hosted provider audits expose the shared JSON audit core', async () => {
  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'check-installation.sh'),
    );

    assert.equal(summary.helper, 'self-hosted-cli-check');
    assert.equal(summary.platform, platform);
    assert.equal(typeof summary.ready, 'boolean');
    assert.match(summary.status, /^(ready|changes_required)$/u);
    assert.equal(Array.isArray(summary.plannedActions), true);
    assert.equal(Array.isArray(summary.manualSteps), true);
    assert.equal(Array.isArray(summary.interruptions), true);
    assert.equal(Array.isArray(summary.checks), true);
    assert.equal(Array.isArray(summary.phases), true);
    assert.equal(Array.isArray(summary.warnings), true);
    assert.equal(summary.phases.length, 3);
    assert.equal(summary.present + summary.missing, summary.checks.length);
  }
});

test('Unix self-hosted provider audits can include 5 native providers, 7 npm tools, and Ollama', async () => {
  const expectedCheckIds = [
    'node',
    'npm',
    'docker',
    'node_prefix',
    'claude',
    'cursor',
    'goose',
    'junie',
    'kiro',
    'codex',
    'gemini',
    'copilot',
    'opencode',
    'kilo',
    'auggie',
    'pi',
    'ollama',
  ];

  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'check-installation.sh'),
      ['--include-local-models'],
    );

    assert.equal(summary.phases.length, 4);
    assert.equal(summary.checks.length, expectedCheckIds.length);
    assert.equal(summary.present + summary.missing, expectedCheckIds.length);
    assert.equal(summary.phases.some((phase) => phase.id === 'local_model_pack'), true);
    for (const checkId of expectedCheckIds) {
      assert.equal(summary.checks.some((entry) => entry.id === checkId), true);
    }
  }
});
