import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { catlasFixture, catlas, fixedNow } from './fixtures/catlasAssist.js';
import { refreshGuideCatAssistEligibleScopes, resolveChatGuideCatAssistReadModel } from '../build/server/products/chat/api/guideCatAssist.js';
import { readCatlasCatalog, updateCatlasCatalog, catlasStatePath, recordCatlasSignals } from '../build/server/shared/guideCatCurationStore.js';
import { emptyGuideCatAssistConfig, writeGuideCatAssistConfig } from '../build/server/shared/guideCatAssistStore.js';
const chatScope = 'chat:new:default:default';
function recommendation(payload, action = 'prefill') {
  const item = payload.snapshot.activeProjects.find(item => item.id === 'project-internal');
  return action === 'open' ? { action, basis: [item.id], target: { id: item.id, kind: item.kind } }
    : { action, basis: [item.id], surface: 'work', label: 'Plan roadmap', prompt: 'Plan the next step for Internal roadmap.' };
}
async function model(f, extra = {}) {
  return resolveChatGuideCatAssistReadModel({ chatStatePath: f.chatStatePath, guideCat: catlas,
    ownerDisplayName: (await f.store.readCore()).ownerProfile.displayName, runtimeReachable: true,
    core: await f.store.readCore(), chat: await f.store.read(), now: fixedNow, locale: 'en', ...extra });
}

test('refresh uses separate fresh sessions, excludes external input from generation and composes explicit-action chips', async t => {
  const f = await catlasFixture(t, (payload, input) => ({ surfaces: payload.scopes.map(scope => ({ scopeKey: scope.scopeKey,
    ...(scope.catalog ? { operations: [{ op: 'add', kind: 'greeting', text: 'Ready for the roadmap?', locale: payload.snapshot.context.locale }] } : {}),
    recommendations: scope.catalog && scope.scopeKey.startsWith('lobby:') ? []
      : [recommendation(payload, scope.catalog ? 'prefill' : 'open')],
  })) }));
  await refreshGuideCatAssistEligibleScopes(f.refresh);
  assert.equal(f.calls.create.length, 2);
  assert.notEqual(f.calls.send[0].sessionId, f.calls.send[1].sessionId);
  assert.ok(!JSON.stringify(f.calls.send[0].payload).includes('EXTERNAL'));
  assert.ok(!JSON.stringify(f.calls.send[0].payload).includes('project-external'));
  assert.ok(JSON.stringify(f.calls.send[1].payload).includes('EXTERNAL'));
  assert.equal(f.calls.send[1].payload.scopes[0].catalog, undefined);
  for (const input of f.calls.create) {
    assert.equal(input.workspaceKind, 'sandbox'); assert.equal(input.workspaceAccess, 'read_only');
    assert.equal(input.sharingMode, 'isolated'); assert.deepEqual(input.mcpServers, []);
    assert.deepEqual(input.skills.requestedSkills, []); assert.equal(input.cwd, undefined);
  }
  assert.equal(f.calls.close.length, 2);
  const result = await model(f);
  assert.equal(result.newChat.bundle.content.entryChips.length, 5);
  assert.equal(result.newChat.bundle.content.entryChips[0].action, 'open');
  assert.equal(result.newChat.bundle.content.entryChips[0].href, '/work/projects/project-internal');
  assert.equal(result.newChat.bundle.content.entryChips[1].action, 'prefill');
  assert.ok(result.newChat.bundle.content.greetings.some(item => item.text === 'Ready for the roadmap?'));
  assert.equal(result.lobby.bundle.content.entryChips.length, 1);
  assert.equal(result.lobby.bundle.content.entryChips[0].action, 'open');
  await refreshGuideCatAssistEligibleScopes(f.refresh);
  assert.equal(f.calls.create.length, 2, 'reads do not spend more calls inside the refresh window');
});

test('navigation cannot launder text or catalog operations by citing an internal basis; units fail independently', async t => {
  const f = await catlasFixture(t, payload => ({ surfaces: payload.scopes.map(scope => ({ scopeKey: scope.scopeKey,
    ...(scope.catalog ? { operations: [] } : { operations: [{ op: 'add', kind: 'chip', label: 'bad', prompt: 'laundered', surface: 'code', locale: 'en' }] }),
    recommendations: scope.catalog ? [] : [recommendation(payload, 'open')],
  })) }));
  await refreshGuideCatAssistEligibleScopes(f.refresh);
  const stored = await readCatlasCatalog(f.chatStatePath);
  assert.ok(stored.surfaces[chatScope].prompt);
  assert.equal(stored.surfaces[chatScope].navigation, undefined);
  const receipts = JSON.parse(await readFile(catlasStatePath(f.chatStatePath, 'receipts'), 'utf8')).receipts;
  assert.equal(receipts.length, 2);
  assert.ok(receipts[1].units.every(unit => unit.outcome === 'rejected' && unit.reasons.includes('unknown_field')));
});

test('failure keeps each last-good partition; current eligibility and changed provenance are revalidated', async t => {
  const f = await catlasFixture(t, payload => ({ surfaces: payload.scopes.map(scope => ({ scopeKey: scope.scopeKey,
    ...(scope.catalog ? { operations: [] } : {}), recommendations: scope.catalog && scope.scopeKey.startsWith('lobby:') ? []
      : [recommendation(payload, scope.catalog ? 'prefill' : 'open')],
  })) }));
  await refreshGuideCatAssistEligibleScopes(f.refresh);
  await f.store.updateCore(core => ({ ...core, projects: core.projects.map(item => item.id === 'project-internal'
    ? { ...item, metadata: { ...item.metadata, externalWorkBindings: { bindings: [{}] } } } : item) }));
  let result = await model(f);
  assert.ok(!result.newChat.bundle.content.entryChips.some(item => item.basis?.length && item.action === 'prefill'));
  assert.ok(result.newChat.bundle.content.entryChips.some(item => item.action === 'open'));
  await f.store.updateCore(core => ({ ...core, projects: core.projects.map(item => item.id === 'project-internal' ? { ...item, status: 'archived' } : item) }));
  result = await model(f);
  assert.ok(!result.newChat.bundle.content.entryChips.some(item => item.basis?.includes('project-internal')));
  assert.ok((await readCatlasCatalog(f.chatStatePath)).surfaces[chatScope].navigation, 'render filtering does not destroy generated storage');
});

test('dismissal renders builtins plus protected owner overrides and makes no calls', async t => {
  const f = await catlasFixture(t);
  const config = emptyGuideCatAssistConfig();
  config.ownerOverrides[chatScope] = { greetings: [{ id: 'owner', text: 'Owner greeting' }], entryChips: [] };
  await writeGuideCatAssistConfig(f.chatStatePath, config);
  await f.store.updateCore(core => ({ ...core, guideCat: { ...catlas, status: 'dismissed' } }));
  await refreshGuideCatAssistEligibleScopes({ ...f.refresh, guideCat: { ...catlas, status: 'dismissed' } });
  assert.equal(f.calls.create.length, 0);
  const result = await model(f, { guideCat: { ...catlas, status: 'dismissed' } });
  assert.deepEqual(result.newChat.bundle.content.entryChips, []);
  assert.equal(result.newChat.bundle.content.greetings[0].text, 'Owner greeting');
  assert.equal(result.newCode.bundle.content.entryChips.length, 5);
  assert.equal(result.newChat.refreshEligible, false);
});

test('dismissed basis is cooled down and expired signals are pruned; generated state survives disabling', async t => {
  const f = await catlasFixture(t);
  await recordCatlasSignals(f.chatStatePath, ['project-internal'], 'dismissed', fixedNow);
  const result = await model(f);
  assert.equal(result.lobby.bundle.content.entryChips.length, 0);
  await refreshGuideCatAssistEligibleScopes(f.refresh);
  assert.ok(!JSON.stringify(f.calls.send.map(call => call.payload)).includes('project-internal'));
  const signals = JSON.parse(await readFile(catlasStatePath(f.chatStatePath, 'signals'), 'utf8'));
  assert.deepEqual(Object.keys(signals.events[0]).sort(), ['event', 'id', 'timestamp']);
});

test('one failed refresh partition retains last-good content while the other advances', async t => {
  let failPrompt = false;
  const f = await catlasFixture(t, payload => {
    if (failPrompt && payload.scopes[0].catalog) throw new Error('provider failure');
    return { surfaces: payload.scopes.map(scope => ({ scopeKey: scope.scopeKey,
      ...(scope.catalog ? { operations: [] } : {}), recommendations: scope.catalog && scope.scopeKey.startsWith('lobby:') ? []
        : [recommendation(payload, scope.catalog ? 'prefill' : 'open')],
    })) };
  });
  await refreshGuideCatAssistEligibleScopes(f.refresh);
  const initial = await readCatlasCatalog(f.chatStatePath);
  failPrompt = true;
  const later = new Date(fixedNow.getTime() + 7 * 60 * 60 * 1000);
  await refreshGuideCatAssistEligibleScopes({ ...f.refresh, now: later });
  const updated = await readCatlasCatalog(f.chatStatePath);
  assert.deepEqual(updated.surfaces[chatScope].prompt, initial.surfaces[chatScope].prompt);
  assert.equal(updated.surfaces[chatScope].navigation.refreshedAt, later.toISOString());
  assert.equal(f.calls.create.length, 4);
  await refreshGuideCatAssistEligibleScopes({ ...f.refresh, now: later });
  assert.equal(f.calls.create.length, 4, 'failed refresh is also throttled');
});
