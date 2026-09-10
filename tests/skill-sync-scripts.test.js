import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

test('cats ships cross-platform skill sync helpers as repo-owned collaboration scripts', async () => {
  const windowsScript = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Sync-AgentSkills.ps1'),
    'utf8',
  );
  const linuxScript = await readFile(
    join(process.cwd(), 'scripts', 'linux', 'sync-agent-skills.sh'),
    'utf8',
  );
  const macosScript = await readFile(
    join(process.cwd(), 'scripts', 'macos', 'sync-agent-skills.sh'),
    'utf8',
  );
  const readme = await readFile(join(process.cwd(), 'scripts', 'README.md'), 'utf8');

  assert.match(windowsScript, /Join-Path \(Join-Path \$ProjectRoot "\.claude"\) "skills"/);
  assert.match(windowsScript, /Join-Path \(Join-Path \$ProjectRoot "\.agents"\) "skills"/);
  assert.doesNotMatch(windowsScript, /\.gemini/);
  assert.match(linuxScript, /\.claude\/skills/);
  assert.match(linuxScript, /\.agents\/skills/);
  assert.doesNotMatch(linuxScript, /\.gemini/);
  assert.doesNotMatch(macosScript, /\.gemini/);
  assert.match(macosScript, /Usage: sync-agent-skills\.sh/);
  assert.match(readme, /Sync-AgentSkills\.ps1/);
  assert.match(readme, /scripts\/linux\/sync-agent-skills\.sh/);
  assert.match(readme, /scripts\/macos\/sync-agent-skills\.sh/);
  assert.doesNotMatch(readme, /\.gemini\/skills/);
});

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const windowsShells = process.platform === 'win32'
  ? ['powershell.exe', 'pwsh.exe'].filter(command => spawnSync(command,
    ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'],
    { windowsHide: true, timeout: 10000 }).error?.code !== 'ENOENT')
  : [];
const runners = [
  ...windowsShells.map(command => ({ command, platform: 'windows', filename: 'Sync-AgentSkills.ps1' })),
  ...(process.platform !== 'win32' || existsSync(bash)
    ? ['linux', 'macos'].map(platform => ({ command: bash, platform, filename: 'sync-agent-skills.sh' }))
    : []),
];

async function seed(root, filename, body) {
  const target = join(root, filename);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
}

async function skillFixture(t, runner) {
  const root = await mkdtemp(join(tmpdir(), 'cats-platform-skill-sync space-'));
  t.after(async () => {
    assert.equal(dirname(root), tmpdir());
    assert.ok(root.includes('cats-platform-skill-sync space-'));
    await rm(root, { recursive: true, force: true });
  });
  await seed(root, 'AGENTS.md', '# Isolated test project');
  const relativeScript = join('scripts', runner.platform, runner.filename);
  await mkdir(dirname(join(root, relativeScript)), { recursive: true });
  await cp(join(process.cwd(), relativeScript), join(root, relativeScript));
  await seed(root, 'skills/orchestration/handoff/SKILL.md', 'handoff instructions');
  await seed(root, 'skills/orchestration/handoff/references/SKILL.md', 'bundled resource');
  await seed(root, 'skills/direct/SKILL.md', 'direct instructions');
  await seed(root, 'skills/pending.bootstrap/SKILL.md', 'pending proposal');
  await seed(root, 'runtime-skills/product-only/SKILL.md', 'product instructions');
  await seed(root, '.agents/skills/personal/SKILL.md', 'personal instructions');
  const run = (clean = false) => spawnSync(runner.command, runner.platform === 'windows'
    ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, relativeScript), ...(clean ? ['-Clean'] : [])]
    : [relativeScript.replaceAll('\\', '/'), ...(clean ? ['--clean'] : [])],
  { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  return { root, run };
}

for (const runner of runners) {
  test(`${runner.platform}/${runner.command}: syncs nested packages and resources without product skills`, async t => {
    const { root, run } = await skillFixture(t, runner);
    const first = run();
    assert.equal(first.status, 0, `${first.error ?? ''}\n${first.stdout}\n${first.stderr}`);
    for (const mirror of ['.agents', '.claude']) {
      assert.equal(await readFile(join(root, mirror, 'skills/handoff/references/SKILL.md'), 'utf8'), 'bundled resource');
      assert.deepEqual((await readdir(join(root, mirror, 'skills'))).sort(),
        mirror === '.agents' ? ['direct', 'handoff', 'personal'] : ['direct', 'handoff']);
    }
    await seed(root, 'skills/orchestration/handoff/SKILL.md', 'updated instructions');
    const second = run();
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(await readFile(join(root, '.agents/skills/handoff/SKILL.md'), 'utf8'), 'updated instructions');
    assert.equal(await readFile(join(root, '.agents/skills/personal/SKILL.md'), 'utf8'), 'personal instructions');
  });

  test(`${runner.platform}/${runner.command}: rejects duplicate leaf names before changing mirrors`, async t => {
    const { root, run } = await skillFixture(t, runner);
    await seed(root, 'skills/another/handoff/SKILL.md', 'duplicate instructions');
    const result = run(true);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Duplicate skill/);
    assert.deepEqual(await readdir(join(root, '.agents/skills')), ['personal']);
    assert.equal(existsSync(join(root, '.claude')), false);
  });
}
