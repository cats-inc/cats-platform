import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  isCompanionCat,
  withCompanionRole,
} from '../build/server/shared/companionRole.js';
import {
  normalizeCatSkillProfile,
  resolveSkillProfileManifest,
} from '../build/server/shared/skillProfiles.js';
import {
  assignCatToChannel,
  buildChannelView,
  createCat,
  createChannel,
  setCatCompanion,
  updateCatSkillProfile,
} from '../build/server/products/chat/state/model/index.js';
import { resolveCompanionRoleMigrationBackupPath } from '../build/server/products/chat/state/companionRoleMigration.js';
import { FileChatStore, MemoryChatStore } from '../build/server/products/chat/state/store.js';

const AGENCY_SKILL = 'plugin:agency-agents/work/agency-code-reviewer';

test('companion runtime skill is derived from the role and stacks on built-in profiles only', () => {
  assert.deepEqual(
    resolveSkillProfileManifest({ profileId: null, companion: true })?.requestedSkills,
    ['companion'],
  );
  assert.equal(resolveSkillProfileManifest({ profileId: null, companion: true })?.profileId, undefined);
  assert.deepEqual(
    resolveSkillProfileManifest({ profileId: 'chat-default', companion: true })?.requestedSkills,
    ['companion'],
  );
  assert.equal(resolveSkillProfileManifest({ profileId: null, companion: false }), undefined);

  // Runtime managed-plugin sessions accept managed skills only.
  const pluginManifest = resolveSkillProfileManifest({ profileId: AGENCY_SKILL, companion: true });
  assert.deepEqual(pluginManifest?.requestedSkills, [AGENCY_SKILL]);
  assert.equal(pluginManifest?.profileId, AGENCY_SKILL);
});

test('companion is not accepted as a Cat skill profile', async () => {
  assert.throws(() => normalizeCatSkillProfile('companion'), /companion is a Cat role/);
  assert.equal(normalizeCatSkillProfile('  '), null);
  assert.equal(normalizeCatSkillProfile(AGENCY_SKILL), AGENCY_SKILL);

  const initial = await new MemoryChatStore().read();
  assert.throws(
    () => createCat(initial, { name: 'Legacy', provider: 'claude', skillProfile: 'companion' }),
    /companion is a Cat role/,
  );
  const created = createCat(initial, { name: 'Milo', provider: 'claude' });
  assert.throws(
    () => updateCatSkillProfile(created, created.cats[0].id, 'companion'),
    /companion is a Cat role/,
  );
});

test('withCompanionRole keeps order when membership already matches', () => {
  assert.deepEqual(withCompanionRole(['companion', 'reviewer'], true), ['companion', 'reviewer']);
  assert.deepEqual(withCompanionRole(['reviewer'], true), ['reviewer', 'companion']);
  assert.deepEqual(withCompanionRole(['companion', 'reviewer'], false), ['reviewer']);
});

test('channel cat views project the Cat companion role over assignment snapshots', async () => {
  const now = new Date('2026-09-29T00:00:00.000Z');
  let state = await new MemoryChatStore().read();
  state = createCat(state, { name: 'Milo', provider: 'claude', roles: ['companion'] }, now);
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Review room',
      topic: 'Assignment roles are channel-local.',
      originSurface: 'chat',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude', roles: ['reviewer'] }, now);

  const roleOf = (next) => buildChannelView(next, channelId).assignedCats
    .find((cat) => cat.catId === catId)?.roles;
  assert.deepEqual(roleOf(state), ['reviewer', 'companion']);

  state = setCatCompanion(state, catId, false);
  assert.equal(isCompanionCat(state.cats[0]), false);
  assert.deepEqual(roleOf(state), ['reviewer']);

  state = setCatCompanion(state, catId, true);
  assert.deepEqual(state.cats[0].roles, ['companion']);
  assert.deepEqual(roleOf(state), ['reviewer', 'companion']);
});

async function writeLegacyCompanionSnapshot(statePath) {
  const store = new FileChatStore(statePath);
  const now = new Date('2026-09-29T00:00:00.000Z');
  let state = await store.read();
  state = createCat(state, { name: 'Milo', provider: 'claude', roles: ['reviewer'] }, now);
  state = createCat(state, { name: 'Otis', provider: 'claude' }, now);
  await store.write(state);

  const snapshot = JSON.parse(await readFile(statePath, 'utf-8'));
  const milo = snapshot.chat.cats.find((cat) => cat.name === 'Milo');
  milo.skillProfile = 'companion';
  const raw = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(statePath, raw, 'utf-8');
  return { raw, miloId: milo.id };
}

test('FileChatStore migrates legacy companion skill profiles once, with a dedicated backup', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-role-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const { raw, miloId } = await writeLegacyCompanionSnapshot(statePath);

  const state = await new FileChatStore(statePath).read();
  const milo = state.cats.find((cat) => cat.id === miloId);
  assert.deepEqual(milo.roles, ['reviewer', 'companion']);
  assert.equal(milo.skillProfile, null);
  assert.equal(isCompanionCat(state.cats.find((cat) => cat.name === 'Otis')), false);

  const backupPath = resolveCompanionRoleMigrationBackupPath(statePath);
  assert.equal(await readFile(backupPath, 'utf-8'), raw);
  const persisted = JSON.parse(await readFile(statePath, 'utf-8'));
  assert.equal(persisted.chat.cats.find((cat) => cat.id === miloId).skillProfile, null);

  const afterFirstRead = await readFile(statePath, 'utf-8');
  await new FileChatStore(statePath).read();
  assert.equal(await readFile(statePath, 'utf-8'), afterFirstRead);
  assert.equal(await readFile(backupPath, 'utf-8'), raw);
});

test('FileChatStore does not migrate while something other than a file occupies the backup path', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-role-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const { miloId } = await writeLegacyCompanionSnapshot(statePath);
  const backupPath = resolveCompanionRoleMigrationBackupPath(statePath);
  await mkdir(backupPath);

  const blocked = await new FileChatStore(statePath).read();
  assert.equal(blocked.cats.find((cat) => cat.id === miloId).skillProfile, 'companion');
  const stored = JSON.parse(await readFile(statePath, 'utf-8'));
  assert.equal(stored.chat.cats.find((cat) => cat.id === miloId).skillProfile, 'companion',
    'without a backup the stored profile keeps its legacy value');

  await rm(backupPath, { recursive: true });
  const beforeMigration = await readFile(statePath, 'utf-8');
  const migrated = await new FileChatStore(statePath).read();
  assert.deepEqual(migrated.cats.find((cat) => cat.id === miloId).roles, ['reviewer', 'companion']);
  assert.equal(await readFile(backupPath, 'utf-8'), beforeMigration);
});

test('FileChatStore migrates a legacy .bak during recovery and backs up the .bak bytes', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-role-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const { raw, miloId } = await writeLegacyCompanionSnapshot(statePath);
  await writeFile(`${statePath}.bak`, raw, 'utf-8');
  await writeFile(statePath, '{', 'utf-8');

  const state = await new FileChatStore(statePath).read();
  assert.deepEqual(state.cats.find((cat) => cat.id === miloId).roles, ['reviewer', 'companion']);
  assert.equal(await readFile(resolveCompanionRoleMigrationBackupPath(statePath), 'utf-8'), raw);
  const primary = JSON.parse(await readFile(statePath, 'utf-8'));
  assert.equal(primary.chat.cats.find((cat) => cat.id === miloId).skillProfile, null);
});

test('MemoryChatStore migrates legacy companion skill profiles from its seed', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-role-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const { raw, miloId } = await writeLegacyCompanionSnapshot(statePath);

  const state = await new MemoryChatStore(JSON.parse(raw)).read();
  const milo = state.cats.find((cat) => cat.id === miloId);
  assert.equal(isCompanionCat(milo), true);
  assert.equal(milo.skillProfile, null);
});
