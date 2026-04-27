import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateProviderAgentBoundedObservation,
  type ProviderAgentToolDescriptor,
} from '../src/platform/orchestration/index.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  resolveProviderCapabilityProfile,
  type SupervisedToolManifest,
  type SupervisionPolicy,
} from '../src/platform/supervision/index.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createChannel } from '../src/products/chat/state/model/index.ts';
import { buildChatProviderAgentObservation } from '../src/products/chat/state/providerAgentObservation.ts';

function policy(): SupervisionPolicy {
  return {
    autonomy: 'single_step',
    taskGranularity: 'tiny',
    toolScope: 'read_only',
    scaffolding: 'sop_template',
    validation: 'schema_required',
    checkpointCadence: 'every_step',
    approvalThreshold: 'low',
    fallbackPolicy: 'ask_human',
  };
}

function manifest(name: string): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name,
    manifestVersion: '1.0',
    description: `${name} fixture`,
    sideEffect: 'none',
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: 'never',
    evidence: 'summary',
    failureCodes: ['E_TOOL_SCOPE_DENIED'],
    inputSchema: {
      id: `${name}.input`,
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: `${name}.output`,
      version: '1.0',
      format: 'json_schema',
    },
  };
}

test('Chat provider-agent observation carries routing metadata without raw message content', () => {
  const rawMessage = 'please summarize the confidential roadmap';
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Agent room',
      topic: 'Implementation',
      originSurface: 'chat',
      roomMode: 'boss_chat',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );
  const channel = state.channels[0]!;
  const profile = resolveProviderCapabilityProfile(
    {
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
    },
    {
      assessedAt: '2026-04-28T00:00:00.000Z',
    },
  );
  const availableTools: ProviderAgentToolDescriptor[] = [
    {
      manifest: manifest('chat.context.lookup'),
      reason: 'Read bounded chat context by reference.',
    },
  ];

  const observation = buildChatProviderAgentObservation({
    state,
    channelId: channel.id,
    actorRef: 'orchestrator',
    capabilityProfile: profile,
    policy: policy(),
    availableTools,
    messageCharacterCount: rawMessage.length,
    routing: {
      trigger: 'room_default',
      targetCount: 1,
      unresolvedCount: 0,
      mentionCount: 0,
      resolution: {
        routingMode: 'room_default',
        selectionKind: 'default_target',
        defaultTarget: {
          participantKind: 'orchestrator',
          participantId: 'orchestrator',
          participantName: 'Orchestrator',
        },
        defaultTargetReason: null,
        fallbackTarget: null,
        blockedReason: null,
        note: null,
      },
    },
    now: new Date('2026-04-28T00:01:00.000Z'),
  });

  assert.deepEqual(validateProviderAgentBoundedObservation(observation), []);
  assert.equal(observation.task.kind, 'chat_turn');
  assert.equal(observation.policy.dials.scaffolding, 'sop_template');
  assert.equal(
    observation.summaries.find((summary) => summary.key === 'input_character_count')?.value,
    rawMessage.length,
  );
  assert.equal(JSON.stringify(observation).includes(rawMessage), false);
  assert.equal(
    observation.contextRefs.includes(`chat-channel:${channel.id}`),
    true,
  );
});
