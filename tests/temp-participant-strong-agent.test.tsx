import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateProviderAgentBoundedObservation,
} from '../src/platform/orchestration/index.ts';
import {
  parseProviderCapabilityBootstrapConfigDocument,
  resolveProviderCapabilityProfile,
  type ProviderCapabilityBootstrapConfig,
  type SupervisionPolicy,
} from '../src/platform/supervision/index.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { buildChannelView, createChannel } from '../src/products/chat/state/model/index.ts';
import { resolveExecutionMetadataForTarget } from '../src/products/chat/state/runtimeTargeting.ts';
import { buildChatProviderAgentObservation } from '../src/products/chat/state/providerAgentObservation.ts';

function strongPolicy(): SupervisionPolicy {
  return {
    autonomy: 'milestone_plan',
    taskGranularity: 'milestone',
    toolScope: 'read_only',
    scaffolding: 'few_shot',
    validation: 'schema_required',
    checkpointCadence: 'milestone',
    approvalThreshold: 'low',
    fallbackPolicy: 'retry',
  };
}

function fixtureBootstrapConfig(): ProviderCapabilityBootstrapConfig {
  const result = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'codex-cloud-gpt-5-4-strong-candidate',
          selector: {
            provider: 'codex',
            model: 'gpt-5.4',
            control: 'default',
          },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'Operator-approved strong temporary participant demo.',
        },
      ],
    },
    { observedAt: '2026-04-28T00:00:00.000Z' },
  );

  if (!result.config) {
    throw new Error('Expected fixture bootstrap config to parse.');
  }

  return result.config;
}

test('preset-created temporary participant can be a strong provider-agent without Cat promotion', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Strong temp room',
      topic: 'Demo strong temporary agent',
      originSurface: 'chat',
      entryKind: 'group',
      roomMode: 'chat_channel',
      temporaryParticipants: [
        {
          participantId: 'participant-strong-reviewer',
          name: 'StrongReviewer',
          provider: 'codex',
          instance: 'default',
          model: 'gpt-5.4',
          modelSelection: {
            entryId: 'gpt-5.4',
            entryMode: 'explicit',
          },
          roleHint: 'Review the plan with strong agent capability.',
        },
      ],
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );
  const channel = buildChannelView(state, state.channels[0]!.id);
  const participant = channel.assignedParticipants?.find((candidate) =>
    candidate.participantId === 'participant-strong-reviewer');
  if (!participant) {
    throw new Error('Expected temporary participant.');
  }
  const target = {
    participantKind: 'cat' as const,
    participantId: participant.participantId,
    participantName: participant.name,
    laneId: null,
    sessionId: null,
  };
  const execution = resolveExecutionMetadataForTarget(state, channel.id, target);
  const profile = resolveProviderCapabilityProfile(
    {
      provider: execution.provider ?? 'unknown',
      instance: execution.instance,
      model: execution.model,
      modelSelection: execution.modelSelection ?? null,
    },
    {
      assessedAt: '2026-04-28T00:00:00.000Z',
      bootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const observation = buildChatProviderAgentObservation({
    state,
    channelId: channel.id,
    actorRef: participant.participantId,
    capabilityProfile: profile,
    policy: strongPolicy(),
    messageCharacterCount: 42,
    routing: {
      trigger: 'explicit_mention',
      targetCount: 1,
      unresolvedCount: 0,
      mentionCount: 1,
      resolution: {
        routingMode: 'explicit_single',
        selectionKind: 'explicit_mentions',
        defaultTarget: null,
        defaultTargetReason: null,
        fallbackTarget: null,
        blockedReason: null,
        note: null,
      },
    },
    now: new Date('2026-04-28T00:01:00.000Z'),
  });

  assert.equal(state.cats.some((cat) => cat.id === participant.participantId), false);
  assert.equal(participant.sourceKind, 'adhoc');
  assert.equal(profile.kind, 'strong_agent');
  assert.equal(observation.actor.actorRef, 'participant-strong-reviewer');
  assert.equal(observation.actor.target.kind, 'execution_target');
  assert.equal(
    observation.actor.target.kind === 'execution_target'
      ? observation.actor.target.provider
      : null,
    'codex',
  );
  assert.deepEqual(validateProviderAgentBoundedObservation(observation), []);
});
