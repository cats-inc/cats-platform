import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileChatStore } from '../build/server/products/chat/state/store.js';
import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel, createParallelChatGroup } from '../build/server/products/chat/state/model/index.js';
import { normalizePersistedChatSnapshot } from '../build/server/products/chat/state/chat-snapshot/index.js';
import { CATS_CORE_STATE_VERSION } from '../build/server/core/types.js';
import { parseRuntimeSessionPolicyCreateInput, createRuntimeSessionContractInput } from '../build/server/shared/runtimeSessionPolicy.js';

const policy = { version: 1, mode: 'explicit', access: 'read-only', network: false, approval: 'never' };
function snapshot() {
  const chat = createChannel(createDefaultChatState(), { originSurface: 'chat', title: 'Policy fixture', topic: '',
    cats: [{ name: 'Fixture', provider: 'codex', roles: ['coder'] }] }, new Date());
  return { ...createDefaultCoreState(), chat };
}
async function isolated(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-provider-upgrade-'));
  try { await run(path.join(root, 'state.json')); } finally { await rm(root, { recursive: true, force: true }); }
}

test('version 5 upgrade keeps exact backup bytes and legacy access, then round-trips a restrictive policy', async () => isolated(async file => {
  const old = snapshot(); old.version = 5;
  const raw = JSON.stringify(old, null, 3) + '\n'; await writeFile(file, raw);
  const store = new FileChatStore(file); const state = await store.read();
  assert.equal(await readFile(`${file}.pre-provider-policy.bak`, 'utf8'), raw);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, CATS_CORE_STATE_VERSION);
  assert.equal(CATS_CORE_STATE_VERSION, 6);
  const channel = state.channels.find(c => c.id === state.selectedChannelId);
  assert.equal(channel.runtimeExecutionPolicy, undefined);
  assert.equal(channel.runtimeWorkspaceAccess, 'read_write'); assert.equal(channel.runtimePermissionMode, 'skip');
  channel.runtimeExecutionPolicy = policy; await store.write(state);
  const reopened = await new FileChatStore(file).read();
  assert.deepEqual(reopened.channels.find(c => c.id === channel.id).runtimeExecutionPolicy, policy);
  assert.equal(await readFile(`${file}.pre-provider-policy.bak`, 'utf8'), raw);
}));

test('future primary/backup policy and outer schema are preserved instead of falling back', async () => {
  for (const which of ['primary', 'backup']) for (const future of ['policy', 'version']) await isolated(async file => {
    const primary = snapshot(), backup = snapshot(); const target = which === 'primary' ? primary : backup;
    if (future === 'version') target.version = 999;
    else target.chat.channels[0].runtimeExecutionPolicy = { version: 999 };
    const raw = JSON.stringify(primary), savedBackup = JSON.stringify(backup);
    await writeFile(file, raw); await writeFile(`${file}.bak`, savedBackup);
    const store = new FileChatStore(file);
    await assert.rejects(async () => { const s = await store.read(); await store.write(s); });
    assert.equal(await readFile(file, 'utf8'), raw); assert.equal(await readFile(`${file}.bak`, 'utf8'), savedBackup);
  });
});

test('upgrade backup failure preserves the original and a retry can finish atomically', async () => isolated(async file => {
  const old = snapshot(); old.version = 5; const raw = JSON.stringify(old); await writeFile(file, raw);
  await mkdir(`${file}.pre-provider-policy.bak`);
  await assert.rejects(new FileChatStore(file).read());
  assert.equal(await readFile(file, 'utf8'), raw);
  await rm(`${file}.pre-provider-policy.bak`, { recursive: true });
  await new FileChatStore(file).read();
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 6);
}));

test('new policy survives create/normalize while readonly and allowlist ceilings reject widening', () => {
  const parsed = parseRuntimeSessionPolicyCreateInput({ policy: { workspaceAccess: 'read_write', permissionMode: 'skip', executionPolicy: policy } });
  assert.equal(parsed.ok, true); const input = createRuntimeSessionContractInput(parsed.policy);
  const s = snapshot(); s.chat = createChannel(s.chat, { originSurface: 'code', title: 'New policy', topic: '', ...input }, new Date());
  assert.deepEqual(normalizePersistedChatSnapshot(s).chat.channels.find(c => c.id === s.chat.selectedChannelId).runtimeExecutionPolicy, policy);
  for (const boundary of [{ workspaceAccess: 'read_write', permissionMode: 'whitelist' }, { workspaceAccess: 'read_only', permissionMode: 'default' }]) {
    const p = { version: 1, mode: 'explicit', access: 'full-access', network: true, approval: 'on-request' };
    assert.equal(parseRuntimeSessionPolicyCreateInput({ policy: { ...boundary, executionPolicy: p } }).ok, false);
  }
});
