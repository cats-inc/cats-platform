import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectRuntimeSkillContent, resolveDesktopSkillContentProfile,
  writeRuntimeSkillContent } from '../build/desktop/skillContent.js';
import { parseArgs } from '../scripts/package-desktop.mjs';

test('Desktop staging defaults to release and requires an explicit valid preview selection', () => {
  assert.equal(resolveDesktopSkillContentProfile(undefined), 'release');
  assert.equal(parseArgs([], { CATS_DESKTOP_CONTENT_PROFILE: 'preview' }).contentProfile, 'release');
  assert.equal(parseArgs(['--content-profile', 'preview'], {}).contentProfile, 'preview');
  for (const value of ['', null, 'debug', { profile: 'preview' }]) {
    assert.throws(() => resolveDesktopSkillContentProfile(value));
  }
  for (const argv of [['--content-profile'], ['--content-profile', 'debug']]) assert.throws(() => parseArgs(argv, {}));
});

test('staging snapshots selected content, replaces source authority and rejects disguised links', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-stage-skill-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  await mkdir(join(source, 'preview'), { recursive: true });
  await mkdir(join(source, 'chat'));
  await writeFile(join(source, 'content-profile.json'), '{"schemaVersion":1,"profile":"preview"}');
  await writeFile(join(source, 'chat', 'ordinary.txt'), 'ordinary');
  await writeFile(join(source, 'preview', 'development.txt'), 'preview procedure');
  const captured = await collectRuntimeSkillContent(source, 'release');
  await writeFile(join(source, 'chat', 'ordinary.txt'), 'modified after capture');
  await writeRuntimeSkillContent(captured, join(root, 'stage'));
  assert.equal(await readFile(join(root, 'stage', 'chat', 'ordinary.txt'), 'utf8'), 'ordinary');
  assert.equal(captured.has(join('preview', 'development.txt')), false);
  assert.deepEqual(JSON.parse(captured.get('content-profile.json')), { schemaVersion: 1, profile: 'release' });
  await symlink(join(source, 'preview'), join(source, 'chat', 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(collectRuntimeSkillContent(source, 'release'), /linked content/u);
  await assert.rejects(writeRuntimeSkillContent(captured, join(root, 'stage')), /EEXIST/u);
});
