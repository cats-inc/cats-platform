import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { normalizeGlobalOrchestrator } from '../src/products/chat/state/chat-snapshot/entities.ts';
import {
  setGlobalOrchestratorExecutionTarget,
  updateGlobalOrchestrator,
} from '../src/products/chat/state/model/index.ts';
import { resolveOrchestratorExecutionTarget } from '../src/products/chat/state/runtimeTargeting.ts';

test('default Chat orchestrator exposes separate router config and visible participant hats', () => {
  const orchestrator = createDefaultChatState().globalOrchestrator;

  assert.equal(orchestrator.routerConfig?.kind, 'chat_deterministic_router');
  assert.equal(orchestrator.routerConfig?.participantId, 'orchestrator');
  assert.equal(orchestrator.routerConfig?.defaultDispatch, 'room_default');
  assert.equal(orchestrator.visibleParticipant?.kind, 'visible_orchestrator_participant');
  assert.equal(orchestrator.visibleParticipant?.participantId, 'orchestrator');
  assert.deepEqual(orchestrator.visibleParticipant?.executionTarget, orchestrator.executionTarget);
});

test('normalization lets visible participant execution override legacy orchestrator target', () => {
  const normalized = normalizeGlobalOrchestrator({
    executionTarget: {
      provider: 'claude',
      instance: 'native',
      model: 'sonnet',
    },
    visibleParticipant: {
      displayName: 'Boss Cat',
      executionTarget: {
        provider: 'codex',
        instance: 'default',
        model: 'gpt-5.4',
      },
      executionModelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
      },
    },
  });

  assert.equal(normalized.visibleParticipant?.displayName, 'Boss Cat');
  assert.equal(normalized.executionTarget.provider, 'codex');
  assert.equal(normalized.visibleParticipant?.executionTarget.provider, 'codex');
  assert.equal(normalized.routerConfig?.audiencePolicy, 'chat_capabilities');
});

test('orchestrator execution updates affect the visible participant without changing router config', () => {
  const state = createDefaultChatState();
  const updated = updateGlobalOrchestrator(
    state,
    {
      provider: 'codex',
      instance: 'default',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
      },
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );

  assert.equal(updated.globalOrchestrator.routerConfig?.kind, 'chat_deterministic_router');
  assert.equal(updated.globalOrchestrator.visibleParticipant?.executionTarget.provider, 'codex');
  assert.equal(updated.globalOrchestrator.executionTarget.provider, 'codex');
  assert.deepEqual(updated.globalOrchestrator.visibleParticipant?.executionModelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
  });
});

test('runtime targeting reads the visible participant execution target', () => {
  const state = setGlobalOrchestratorExecutionTarget(
    createDefaultChatState(),
    {
      provider: 'codex',
      instance: 'default',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
      },
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );
  const channel = {
    id: 'channel-1',
    composerMode: 'boss',
    pendingProvider: null,
    pendingInstance: null,
    pendingModel: null,
    pendingModelSelection: null,
  } as Parameters<typeof resolveOrchestratorExecutionTarget>[1];

  assert.deepEqual(resolveOrchestratorExecutionTarget(state, channel), {
    provider: 'codex',
    instance: 'default',
    model: 'gpt-5.4',
    modelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit',
    },
  });
});
