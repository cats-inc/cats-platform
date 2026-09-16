import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Setup-NodeGlobalPrefix.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('npm preparation preserves an existing prefix under the selected user home', skipUnlessWindows(), async () => {
  const home = await mkdtemp(join(tmpdir(), 'cats-prefix-custom-'));
  const prefix = join(home, 'custom-npm');
  await mkdir(prefix);
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperPath,
    '-CheckOnly', '-Json', '-SkipNodeCheck', '-UserHome', home, '-CurrentPrefix', prefix, '-CurrentUserPath', prefix]);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.desiredPrefix, prefix);
});

test('npm preparation preserves an explicit external prefix before creating its directory', skipUnlessWindows(), async () => {
  const root = await mkdtemp(join(tmpdir(), 'cats-prefix-external-'));
  const home = join(root, 'home');
  const prefix = join(root, 'external-not-created');
  await mkdir(home);
  await writeFile(join(home, '.npmrc'), `prefix=${prefix.replaceAll('\\', '/')}\n`);
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperPath,
    '-CheckOnly', '-Json', '-SkipNodeCheck', '-UserHome', home, '-CurrentPrefix', prefix, '-CurrentUserPath', prefix]);
  const result = JSON.parse(stdout);
  assert.equal(result.desiredPrefix, prefix);
  assert.equal(result.plannedChanges.some((entry) => entry.startsWith('Set user-scoped npm prefix')), false);
});

test('Setup-NodeGlobalPrefix reports ready in check mode when prefix and PATH already match', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-node-prefix-ready-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    desiredPrefix,
    '-CurrentUserPath',
    `${desiredPrefix};C:\\Windows\\System32`,
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-npm-prefix-helper');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.plannedChanges, []);
});

test('Setup-NodeGlobalPrefix reports planned changes in check mode when prefix and PATH need repair', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-node-prefix-changes-'));
  const desiredPrefix = join(workingDir, '.npm-global');

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    'C:\\Program Files\\nodejs',
    '-CurrentUserPath',
    'C:\\Windows\\System32',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.restartRequired, true);
  assert.equal(
    result.plannedChanges.some((change) => change.includes(`Set user-scoped npm prefix to ${desiredPrefix}`)),
    true,
  );
  assert.equal(
    result.plannedChanges.some((change) => change.includes(`Add ${desiredPrefix} to the user PATH`)),
    true,
  );
});
