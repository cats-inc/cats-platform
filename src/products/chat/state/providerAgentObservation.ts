import type { ChatState } from '../api/contracts.js';
import type {
  ProviderAgentBoundedObservation,
  ProviderAgentObservationSummary,
  ProviderAgentToolDescriptor,
} from '../../../platform/orchestration/index.js';
import { PROVIDER_AGENT_DECISION_CONTRACT_VERSION } from '../../../platform/orchestration/index.js';
import type {
  ProviderCapabilityProfile,
  SupervisionFallbackPolicy,
  SupervisionPolicy,
} from '../../../platform/supervision/index.js';
import type {
  RoomRouteResolution,
  RoomRoutingTrigger,
} from '../../../shared/roomRouting.js';
import { requireChannel } from './model/index.js';

export interface ChatProviderAgentRoutingSummary {
  trigger: RoomRoutingTrigger;
  resolution: RoomRouteResolution;
  targetCount: number;
  unresolvedCount: number;
  mentionCount: number;
}

export interface BuildChatProviderAgentObservationInput {
  state: ChatState;
  channelId: string;
  actorRef: string;
  capabilityProfile: ProviderCapabilityProfile;
  policy: SupervisionPolicy;
  routing: ChatProviderAgentRoutingSummary;
  messageCharacterCount: number;
  allowedFallbacks?: SupervisionFallbackPolicy[];
  availableTools?: ProviderAgentToolDescriptor[];
  now?: Date;
}

export function buildChatProviderAgentObservation(
  input: BuildChatProviderAgentObservationInput,
): ProviderAgentBoundedObservation {
  const now = input.now ?? new Date();
  const channel = requireChannel(input.state, input.channelId);

  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    observationId: `chat-provider-agent:${channel.id}:${now.toISOString()}`,
    runId: `chat:${channel.id}`,
    goal: 'Handle the next Chat turn using deterministic routing metadata and bounded tools.',
    task: {
      kind: 'chat_turn',
      risk: input.routing.targetCount > 1 ? 'medium' : 'low',
    },
    actor: {
      actorRef: input.actorRef,
      target: {
        kind: 'execution_target',
        provider: input.capabilityProfile.provider,
        model: input.capabilityProfile.model,
        control: input.capabilityProfile.control ?? undefined,
      },
      capabilityProfileRef: input.capabilityProfile.profileId,
      providerRef: input.capabilityProfile.profileId,
    },
    policy: {
      dials: structuredClone(input.policy),
      allowedFallbacks: structuredClone(input.allowedFallbacks ?? [input.policy.fallbackPolicy]),
    },
    availableTools: structuredClone(input.availableTools ?? []),
    contextRefs: [
      `chat-channel:${channel.id}`,
      `chat-room-mode:${channel.roomRouting?.mode ?? 'boss_chat'}`,
      `chat-composer-mode:${channel.composerMode}`,
    ],
    summaries: buildRoutingSummaries(input),
    budget: {
      maxDurationMs: 30_000,
      hardStop: true,
    },
    invariants: [
      'Chat deterministic routing stays product-owned.',
      'Do not infer additional audience targets outside the routing summary.',
      'Do not request tools outside the bounded tool surface.',
    ],
  };
}

function buildRoutingSummaries(
  input: BuildChatProviderAgentObservationInput,
): ProviderAgentObservationSummary[] {
  return [
    {
      key: 'input_character_count',
      kind: 'count',
      value: Math.max(0, input.messageCharacterCount),
    },
    {
      key: 'routing_target_count',
      kind: 'count',
      value: input.routing.targetCount,
    },
    {
      key: 'routing_unresolved_count',
      kind: 'count',
      value: input.routing.unresolvedCount,
    },
    {
      key: 'routing_mention_count',
      kind: 'count',
      value: input.routing.mentionCount,
    },
    {
      key: 'routing_trigger',
      kind: 'enumerated_outcome',
      value: input.routing.trigger,
    },
    {
      key: 'routing_selection_kind',
      kind: 'enumerated_outcome',
      value: input.routing.resolution.selectionKind,
    },
  ];
}
