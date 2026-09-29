import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../build/server/config.js';
import { createServer } from '../build/server/app/server/index.js';
import { FileChatStore } from '../build/server/products/chat/state/store.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { createChatEventHub } from '../build/server/products/chat/api/chatEventHub.js';
import { createTelegramPollingSupervisor } from '../build/server/platform/transports/telegram/polling.js';
import { createAsyncKeyedGate } from '../build/server/products/chat/shared/asyncControl.js';
import { createFileBackedTelegramRelayStore } from '../build/server/platform/transports/telegram/store/index.js';
import { createTelegramRelay } from '../build/server/platform/transports/telegram/relay/index.js';
import { createFileCompanionActivityStore } from '../build/server/products/chat/companion/activityStore.js';
import { createFileTransportWorkStateStore } from '../build/server/platform/transports/work-delivery/stateStore.js';
import { createTransportWorkOutbox } from '../build/server/platform/transports/work-delivery/outbox.js';
import { createTransportWorkActionTokenStore, encodeTransportWorkCallbackData } from '../build/server/platform/transports/work-delivery/actionTokens.js';
import { createRuntimeClientDiagnosticSink, createRuntimeClientDiagnosticRecord } from '../build/server/runtime/clientDiagnostics.js';
import { preparePlatformOwnedDataReset, removePlatformOwnedData, PLATFORM_RESET_FILES, PLATFORM_RESET_DIRECTORIES, PLATFORM_RESET_RETAINED } from '../build/server/shared/platformDataReset.js';

async function seed(file, text = 'pre-reset-private-data') {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}
const missing = async file => assert.rejects(readFile(file), { code: 'ENOENT' });

test('reset erases its explicit owned set and all state backups, logs it, and tolerates missing files', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'cats-reset-owned-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'platform');
  const state = path.join(root, 'state/chat-state.local.json');
  const ownedFiles = PLATFORM_RESET_FILES.map(file => path.join(root, 'state', file));
  const ownedDirectories = PLATFORM_RESET_DIRECTORIES.map(directory => path.join(root, directory));
  const backups = ['chat-state.local.json.bak', 'chat-state.local.json.pre-companion-role.bak', 'other-migration.bak']
    .map(file => path.join(root, 'state', file));
  backups.push(path.join(root, 'state/.chat-state.local.json.123.crash.tmp'));
  for (const file of [...ownedFiles, ...backups]) await seed(file);
  for (const directory of ownedDirectories) await seed(path.join(directory, 'nested/private.bak'));
  const attachment = path.join(root, 'project/.cats-attachments');
  await seed(path.join(attachment, 'secret.txt'));
  const retained = ['platform/config/platform-preferences.json', 'platform/apps/data/data.json',
    'platform/plugins/registry.json', 'runtime/data/native.json', 'desktop/preferences.json',
    '.claude/login.json', 'external/.cats-attachments/secret.txt', 'platform/project/source.ts', 'unrelated.txt'];
  for (const file of retained) await seed(path.join(home, file), 'retained');
  const lines = [];
  const options = { report: line => lines.push(line), attachmentDirectories: [attachment, path.join(home, 'external/.cats-attachments')] };
  const removed = await removePlatformOwnedData(state, options);
  assert.ok(removed.includes('state/chat-state.local.json.pre-companion-role.bak'));
  assert.equal(removed.at(-1), 'state/chat-state.local.json', 'erase the clean primary after backups, preventing old recovery on an interrupted purge');
  for (const file of [...ownedFiles, ...backups, ...ownedDirectories.map(directory => path.join(directory, 'nested/private.bak')), path.join(attachment, 'secret.txt')]) await missing(file);
  for (const file of retained) assert.equal(await readFile(path.join(home, file), 'utf8'), 'retained');
  assert.ok(lines.some(line => line.includes('removed "state/chat-state.local.memory.json"')));
  assert.ok(lines.every(line => !line.includes('pre-reset-private-data')));
  assert.deepEqual(await removePlatformOwnedData(state, options), []);
});

test('reset rejects redirected ancestor directories before deleting any owned data', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'cats-reset-links-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'platform');
  const external = path.join(home, 'external');
  await seed(path.join(root, 'state/chat-state.local.json'), 'keep until layout validates');
  await seed(path.join(external, 'runtime-history/private.txt'), 'external');
  await symlink(external, path.join(root, 'cache'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(removePlatformOwnedData(path.join(root, 'state/chat-state.local.json')), /redirected/);
  assert.equal(await readFile(path.join(root, 'state/chat-state.local.json'), 'utf8'), 'keep until layout validates');
  assert.equal(await readFile(path.join(external, 'runtime-history/private.txt'), 'utf8'), 'external');
});

test('real reset route purges backups and cached transport/activity data, rejects busy work, and can set up again', async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'cats-reset-route-'));
  const config = loadConfig({ HOME: home, CATS_PLATFORM_DIR: path.join(home, 'platform'),
    CATS_AUTH_SESSION_SECRET: 'isolated-reset-test-session-secret' });
  const store = new FileChatStore(config.chatStatePath);
  const relayStore = createFileBackedTelegramRelayStore(config.chatStatePath);
  relayStore.markProcessedUpdate(101);
  const activity = createFileCompanionActivityStore(path.join(config.platformStateDir, 'companion-activity.json'));
  await activity.append({ id: 'old', catId: 'cat-old', group: 'memory', targetKind: 'memory', targetId: 'old', occurredAt: new Date().toISOString() });
  const gate = createAsyncKeyedGate();
  const eventHub = createChatEventHub();
  const server = createServer({ shared: { config, runtimeClient: {
    async getHealth() { return { reachable: false, status: 'unavailable' }; },
  } }, chat: { chatStore: store, mutationGate: gate, companionActivityStore: activity, eventHub,
    telegramRelay: createTelegramRelay({ store: relayStore }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await server.startupRecovery;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const complete = identifier => fetch(`${url}/api/platform/setup/complete`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ ownerDisplayName: 'Owner',
      createGuideCat: false, adminIdentifier: identifier, adminPassword: 'isolated-password' }) });
  const setup = await complete('before@example.test');
  assert.equal(setup.status, 200, await setup.text());
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const status = await (await fetch(`${url}/api/auth/status`, { headers: { cookie } })).json();
  const reset = () => fetch(`${url}/api/setup/reset`, { method: 'POST', headers: { cookie, 'x-cats-csrf-token': status.csrfToken } });
  await seed(`${config.chatStatePath}.pre-companion-role.bak`);
  await seed(path.join(config.platformStateDir, 'chat-state.local.memory.json'), '{"version":1,"records":[]}');
  await seed(path.join(config.platformDir, 'evidence/old.jsonl'));
  await seed(path.join(config.platformStateDir, 'transport-work-delivery.json'), '{"version":1,"deliveries":[],"actionTokens":[]}');
  let release;
  const held = gate.run('busy-turn', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  try { assert.equal((await reset()).status, 409); }
  finally { release(); await held; }
  assert.ok((await store.readCore()).setupCompleteAt);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${url}/api/events/chat`, { headers: { cookie }, signal: controller.signal });
  assert.equal(stream.status, 200);
  const streamText = stream.text();
  const response = await reset();
  assert.equal(response.status, 200, await response.text());
  assert.equal(relayStore.getProcessedUpdateCount(), 0);
  assert.deepEqual(await activity.list('cat-old'), []);
  assert.equal((await readdir(config.platformStateDir)).some(file => file.endsWith('.bak')), false);
  for (const file of ['chat-state.local.memory.json', 'transport-work-delivery.json', 'chat-state.local.telegram-relay.json']) await missing(path.join(config.platformStateDir, file));
  await missing(path.join(config.platformDir, 'evidence/old.jsonl'));
  eventHub.emit({ kind: 'room_updated', channelId: 'new-profile-private-id', timestamp: new Date().toISOString() });
  let streamTimeout;
  try {
    const text = await Promise.race([streamText, new Promise((_, reject) => {
      streamTimeout = setTimeout(() => { controller.abort(); reject(new Error('old authenticated stream remains open')); }, 2_000);
    })]);
    assert.ok(!text.includes('new-profile-private-id'));
  } finally { clearTimeout(streamTimeout); }
  relayStore.markProcessedUpdate(202);
  const persistedRelay = JSON.parse(await readFile(path.join(config.platformStateDir, 'chat-state.local.telegram-relay.json'), 'utf8'));
  assert.deepEqual(persistedRelay.processedUpdateIds, [202]);
  assert.equal((await complete('after@example.test')).status, 200);
  assert.equal((await (await fetch(`${url}/api/auth/status`, { headers: { cookie } })).json()).authenticated, false);
  assert.notEqual((await store.readCore()).setupCompleteAt, null);
});

test('partial purge survives restart and rediscovers owned attachment targets from its bounded journal', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-reset-retry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = path.join(root, 'state/chat-state.local.json');
  const attachment = path.join(root, 'project/.cats-attachments');
  await seed(path.join(attachment, 'private.txt'));
  await seed(path.join(root, 'state/chat-state.local.memory.json'));
  await preparePlatformOwnedDataReset(state, { attachmentDirectories: [attachment] });
  const store = new FileChatStore(state);
  await store.writeSnapshot(createDefaultChatState(), createDefaultCoreState());
  await assert.rejects(removePlatformOwnedData(state, { remove: async (target, options) => {
    if (target.endsWith('chat-state.local.memory.json')) throw new Error('injected locked file');
    return rm(target, options);
  } }), /locked file/);
  assert.equal(await readFile(path.join(attachment, 'private.txt'), 'utf8'), 'pre-reset-private-data');
  assert.deepEqual((await new FileChatStore(state).read()).channels, []);
  // Like a retry in a fresh process: no old ChatState/options/closure is supplied.
  await preparePlatformOwnedDataReset(state, {});
  await removePlatformOwnedData(state);
  await missing(path.join(attachment, 'private.txt'));
  await missing(path.join(root, 'state/platform-data-reset.pending.json'));
});

for (const heldRequest of ['deleteWebhook', 'getUpdates']) test(`reset aborts ${heldRequest} and removes stopped polling consumers`, { timeout: 2_000 }, async () => {
  let reached;
  const requestStarted = new Promise(resolve => { reached = resolve; });
  const supervisor = createTelegramPollingSupervisor({ pollingTimeout: 0,
    fetchImpl: async (url, options) => {
      if (!String(url).includes(heldRequest)) return new Response('{"ok":true}', { status: 200 });
      assert.ok(options.signal, 'startup webhook removal and long polling must both be abortable');
      reached();
      await new Promise((_, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true });
      });
    } });
  await supervisor.startPolling({ bindingId: 'old-binding', botToken: 'isolated-token',
    context: { botBindings: [], defaultBotBinding: null, selectedBotBinding: null }, telegramRelay: { resolveBinding: () => null } });
  await requestStarted;
  assert.equal(supervisor.getAllPollingStatuses().length, 1);
  supervisor.stopAll();
  await supervisor.drain();
  supervisor.clearForReset();
  assert.deepEqual(supervisor.getAllPollingStatuses(), []);
  assert.equal(supervisor.getPollingStatus('old-binding'), null);
});

test('every locale discloses every erased category and the retained ownership boundaries', async () => {
  const locales = {
    en: ['backups', 'memory', 'companion', 'local knowledge', 'evidence', 'Telegram / LINE', 'delivery', 'schedules', 'attachments', 'runtime-history', 'chats', 'cats', 'accounts', 'login sessions', 'setup state'],
    'zh-TW': ['備份', '記憶', '陪伴', '本機知識', '證據', 'Telegram／LINE', '交付', '排程', '附件', 'runtime-history', '聊天', '貓咪', '帳號', '登入工作階段', '初始設定'],
  };
  const categoriesForTargets = [
    [/chat-state\.local\.json$/, 'chats', '聊天'],
    [/memory/, 'memory', '記憶'], [/companion/, 'companion', '陪伴'],
    [/knowledge/, 'local knowledge', '本機知識'], [/evidence/, 'evidence', '證據'],
    [/telegram|line-relay|(?:^|\/)line$/, 'Telegram / LINE', 'Telegram／LINE'],
    [/work-delivery/, 'delivery', '交付'], [/scheduler/, 'schedules', '排程'],
    [/onboarding|guide-cat-assist/, 'setup state', '初始設定'],
    [/auth-/, 'accounts', '帳號'], [/attachments/, 'attachments', '附件'],
    [/runtime-history/, 'runtime-history', 'runtime-history'],
    [/diagnostics|provider-snapshot/, 'diagnostic caches', '診斷快取'],
  ];
  for (const [locale, categories] of Object.entries(locales)) {
    const source = await readFile(new URL(`../src/shared/i18n/catalogs/${locale}.ts`, import.meta.url), 'utf8');
    const copy = source.match(/'settings.data.resetAllDataDescription':\s*'([^']+)'/)[1];
    for (const category of categories) assert.ok(copy.includes(category), `${locale}: ${category}`);
    for (const target of [...PLATFORM_RESET_FILES, ...PLATFORM_RESET_DIRECTORIES]) {
      const match = categoriesForTargets.find(([pattern]) => pattern.test(target));
      assert.ok(match, `reset target requires a disclosed category: ${target}`);
      assert.ok(copy.includes(match[locale === 'en' ? 1 : 2]), `${locale}: ${target}`);
    }
    for (const category of locale === 'en' ? PLATFORM_RESET_RETAINED : ['主機偏好、組態與安裝識別', 'Apps／plugins 及其資料', 'Desktop 與 Runtime', 'CLI 登入與原生對話紀錄', '外部工作區']) assert.ok(copy.includes(category), `${locale}: ${category}`);
  }
});

test('delivery and diagnostics reset clears live caches before future writes', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-reset-live-caches-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const statePath = path.join(root, 'transport-work-delivery.json');
  const store = createFileTransportWorkStateStore(statePath);
  const tokens = createTransportWorkActionTokenStore({ store });
  const outbox = createTransportWorkOutbox({ store, send: async () => ({ ok: true, externalMessageRef: 'sent' }) });
  const input = { bindingId: 'binding', externalConversationRef: 'external', workItemId: 'old-work', purpose: 'ack',
    payload: { text: 'old private text', deepLink: null, actions: [] } };
  outbox.enqueue({ ...input, idempotencyKey: 'old' });
  const token = tokens.issue({ bindingId: 'binding', ownerActorId: 'owner', externalUserRef: 'external',
    workItemId: 'old-work', proposalRevision: 1, proposalDigest: 'digest', action: 'start_work' });
  const scope = { callbackData: encodeTransportWorkCallbackData(token.token), bindingId: 'binding', externalUserRef: 'external',
    resolveScope: () => ({ proposalRevision: 1, proposalDigest: 'digest', allowedActions: ['start_work'] }) };
  assert.equal(tokens.resolve(scope).status, 'resolved');
  assert.equal(outbox.isIdle(), true);
  outbox.clearForReset(); tokens.clearForReset(); store.clearForReset();
  await rm(statePath);
  assert.equal(tokens.resolve(scope).reason, 'unknown_token');
  assert.deepEqual(outbox.list('old-work'), []);
  outbox.enqueue({ ...input, idempotencyKey: 'new', workItemId: 'new-work', payload: { ...input.payload, text: 'new' } });
  const persisted = JSON.parse(await readFile(statePath, 'utf8'));
  assert.deepEqual(persisted.deliveries.map(row => row.idempotencyKey), ['new']);
  assert.deepEqual(persisted.actionTokens, []);

  const diagnosticPath = path.join(root, 'runtime-client-diagnostics.local.json');
  const diagnostics = createRuntimeClientDiagnosticSink({ persistPath: diagnosticPath });
  const diagnostic = sessionId => createRuntimeClientDiagnosticRecord({ kind: 'session_create_slow', provider: 'claude',
    sessionId, observedAt: new Date().toISOString(), elapsedMs: 1, thresholdMs: 1 });
  diagnostics.emit(diagnostic('old-session'));
  diagnostics.clearForReset();
  await rm(diagnosticPath);
  diagnostics.emit(diagnostic('new-session'));
  assert.deepEqual(JSON.parse(await readFile(diagnosticPath, 'utf8')).records.map(row => row.sessionId), ['new-session']);
});
