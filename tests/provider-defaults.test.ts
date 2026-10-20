import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultCoreState, upsertCoreActor } from '../src/core/model/index.ts';
import { createDefaultExecutionTarget } from '../src/core/model/shared.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { normalizeNewChatDefaults, normalizeGlobalOrchestrator } from '../src/products/chat/state/chat-snapshot/entities.ts';
import { buildSetupDebugContext, parseGuideCatUpdateBody } from '../src/app/server/platformSetupRouteSupport.ts';
import { getDefaultModel, getDefaultProviderInstance } from '../src/shared/providerCatalog.ts';

test('fresh core, Chat and optional Catlas setup defaults use Codex consistently', () => {
  assert.equal(createDefaultExecutionTarget().provider, 'codex');
  const chat = createDefaultChatState();
  assert.equal(chat.newChatDefaults.provider, 'codex');
  assert.equal(chat.globalOrchestrator.executionTarget.provider, 'codex');
  assert.equal(createDefaultCoreState().actors.find(actor => actor.kind === 'orchestrator')?.defaultExecutionTarget?.provider, 'codex');
  const parsed = parseGuideCatUpdateBody({});
  assert.equal(parsed.ok && parsed.value.provider, 'codex');
  assert.equal(buildSetupDebugContext({ ownerDisplayName: 'Test', createGuideCat: true }).guideCatProvider, 'codex');
});

test('saved provider/instance/model and historical missing-field defaults are preserved', () => {
  const saved = { provider: 'claude', instance: 'cli/subscription', model: 'legacy-custom', modelSelection: null };
  assert.deepEqual(normalizeNewChatDefaults(saved), { catId: null, ...saved });
  assert.equal(normalizeNewChatDefaults({ ...saved, catId: 'cat-milo' }).catId, 'cat-milo');
  for (const raw of [undefined, { provider: 'claude', instance: null, model: null }]) {
    assert.deepEqual(normalizeNewChatDefaults(raw), { catId: null, provider: 'claude',
      instance: getDefaultProviderInstance('claude'), model: getDefaultModel('claude') || null, modelSelection: null });
  }
  assert.equal(normalizeGlobalOrchestrator(undefined).executionTarget.provider, 'claude');
  const parsed = parseGuideCatUpdateBody(saved);
  assert.equal(parsed.ok && parsed.value.provider, 'claude');
  let core = upsertCoreActor(createDefaultCoreState(), { id: 'saved-worker', name: 'Saved', kind: 'worker', defaultExecutionTarget: saved }).core;
  const updated = upsertCoreActor(core, { id: 'saved-worker', name: 'Saved', kind: 'worker', defaultExecutionTarget: { model: 'new-custom' } });
  core = updated.core;
  assert.equal(core.actors.find(actor => actor.id === 'saved-worker')?.defaultExecutionTarget?.provider, 'claude');
  assert.equal(updated.actor.defaultExecutionTarget?.instance, 'cli/subscription');
});
