/**
 * Deterministic mention routing — system-layer routing decisions based on
 * @mentions in message text, independent of prompt engineering.
 *
 * SPEC-018: Direct Cat Chat and Conversation Routing Layer
 * SPEC-026: Explicit Mentions and Dynamic Room Workflow Orchestration
 */

import type {
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelView,
  ChatState,
} from '../api/contracts.js';
import type {
  RoomRouteBlockedReason,
  RoomRouteDefaultTargetReason,
  RoomRouteResolution,
  RoomRouteResolutionMode,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
} from '../../../shared/roomRouting.js';
import { isDirectLaneChannel } from '../shared/channelTopology.js';
import {
  activeAssignedParticipants,
  findAssignedParticipant,
} from '../shared/channelParticipants.js';
import {
  ORCHESTRATOR_NAME,
  buildChannelView,
  resolveOrchestratorDisplayName,
} from './model/index.js';
import { parseMentions } from './mentionParsing.js';

export type MentionRoutingMode = RoomRouteResolutionMode;

export interface RoutingTarget extends RoomRoutingParticipantRef {
  sessionId: string | null;
}

export interface RoomDefaultTargetResolution {
  participant: RoomRoutingParticipantRef | null;
  target: RoutingTarget | null;
  defaultTargetReason: RoomRouteDefaultTargetReason | null;
  blockedReason: RoomRouteBlockedReason | null;
  note: string | null;
}

export interface MentionRouteResult {
  /** Resolved routing targets */
  targets: RoutingTarget[];
  /** @mention names that could not be resolved to any participant */
  unresolvedMentions: string[];
  /** All parsed mention names from the message */
  parsedMentionNames: string[];
  /** How the routing was triggered */
  trigger: RoomRoutingTrigger;
  /** Classification of the routing decision */
  routingMode: MentionRoutingMode;
  /** Stable machine-readable routing resolution for this turn */
  resolution: RoomRouteResolution;
}

type AssignedParticipant = ChatChannelCat | ChatChannelParticipant;

function isSoloChatChannel(channel: Pick<ChatChannelView, 'composerMode' | 'roomRouting'>): boolean {
  return channel.composerMode === 'solo'
    && !isDirectLaneChannel(channel);
}

function buildOrchestratorTarget(state: ChatState, channel: ChatChannelView): RoutingTarget {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: isSoloChatChannel(channel) ? 'Chat' : resolveOrchestratorDisplayName(state),
    sessionId: channel.orchestratorLease.sessionId,
  };
}

function buildCatTarget(cat: AssignedParticipant): RoutingTarget {
  return {
    participantKind: 'cat',
    participantId: cat.participantId,
    participantName: cat.name,
    sessionId: cat.execution.lease.sessionId,
  };
}

export function resolveCurrentTurnRecipientTargets(
  state: ChatState,
  channelId: string,
  participantIds: readonly string[],
): RoutingTarget[] {
  const channel = buildChannelView(state, channelId);
  const participantsById = new Map(
    activeAssignedParticipants(channel).map((participant) => [participant.participantId, participant]),
  );
  const targets: RoutingTarget[] = [];

  for (const participantId of participantIds) {
    const normalizedParticipantId = participantId.trim();
    if (!normalizedParticipantId) {
      continue;
    }

    const participant = participantsById.get(normalizedParticipantId);
    if (!participant) {
      continue;
    }

    if (!targets.some((target) => target.participantId === participant.participantId)) {
      targets.push(buildCatTarget(participant));
    }
  }

  return targets;
}

function toParticipantRef(target: RoutingTarget): RoomRoutingParticipantRef {
  return {
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
  };
}

function buildDirectLeadParticipantRef(
  state: ChatState,
  channel: ChatChannelView,
  defaultRecipientId: string,
): RoomRoutingParticipantRef {
  const leadParticipantName = findAssignedParticipant(channel, defaultRecipientId)?.name
    ?? state.cats.find((cat) => cat.id === defaultRecipientId)?.name
    ?? 'Direct Cat';
  return {
    participantKind: 'cat',
    participantId: defaultRecipientId,
    participantName: leadParticipantName,
  };
}

export function resolveRoomDefaultRoutingTarget(
  state: ChatState,
  channelOrId: ChatChannelView | string,
): RoomDefaultTargetResolution {
  const channel = typeof channelOrId === 'string'
    ? buildChannelView(state, channelOrId)
    : channelOrId;
  const routing = channel.roomRouting ?? null;
  const activeParticipants = activeAssignedParticipants(channel);

  if (isDirectLaneChannel(channel) && routing?.defaultRecipientId) {
    const leadCat = activeParticipants
      .find((participant) => participant.participantId === routing.defaultRecipientId);
    if (leadCat) {
      const target = buildCatTarget(leadCat);
      return {
        participant: toParticipantRef(target),
        target,
        defaultTargetReason: 'direct_chat_recipient',
        blockedReason: null,
        note: null,
      };
    }

    return {
      participant: buildDirectLeadParticipantRef(state, channel, routing.defaultRecipientId),
      target: null,
      defaultTargetReason: 'direct_chat_recipient',
      blockedReason: 'missing_direct_chat_recipient',
      note: 'This direct chat no longer has an active lead Cat. Re-add the Cat or mention another participant explicitly.',
    };
  }

  if (channel.composerMode === 'cat_led' && routing?.defaultRecipientId) {
    const leadCat = activeParticipants
      .find((participant) => participant.participantId === routing.defaultRecipientId);
    if (leadCat) {
      const target = buildCatTarget(leadCat);
      return {
        participant: toParticipantRef(target),
        target,
        defaultTargetReason: 'cat_led_recipient',
        blockedReason: null,
        note: null,
      };
    }

    const leadCatName = activeParticipants
      .find((participant) => participant.participantId === routing.defaultRecipientId)?.name
      ?? state.cats.find((cat) => cat.id === routing.defaultRecipientId)?.name
      ?? 'Lead Participant';
    return {
      participant: {
        participantKind: 'cat',
        participantId: routing.defaultRecipientId,
        participantName: leadCatName,
      },
      target: null,
      defaultTargetReason: 'cat_led_recipient',
      blockedReason: 'missing_cat_led_recipient',
      note: 'This chat no longer has an active lead Cat. Re-add the Cat or pick another lead before continuing.',
    };
  }

  const target = buildOrchestratorTarget(state, channel);
  return {
    participant: toParticipantRef(target),
    target,
    defaultTargetReason: 'boss_chat_default',
    blockedReason: null,
    note: null,
  };
}

function createRouteResolution(input: {
  defaultTarget: RoomDefaultTargetResolution;
  routingMode: MentionRoutingMode;
  selectionKind: RoomRouteResolution['selectionKind'];
  blockedReason?: RoomRouteBlockedReason | null;
  fallbackTarget?: RoomRoutingParticipantRef | null;
  note?: string | null;
}): RoomRouteResolution {
  return {
    routingMode: input.routingMode,
    selectionKind: input.selectionKind,
    defaultTarget: input.defaultTarget.participant,
    defaultTargetReason: input.defaultTarget.defaultTargetReason,
    fallbackTarget: input.fallbackTarget ?? null,
    blockedReason: input.blockedReason ?? null,
    note: input.note ?? input.defaultTarget.note,
  };
}

/**
 * Resolve routing targets from message text using deterministic mention parsing.
 *
 * This is the system-layer routing decision — it runs BEFORE any prompt
 * construction and produces a structured result that the dispatch loop consumes.
 *
 * Routing rules:
 * - No mentions + boss_chat → Boss Cat (orchestrator) via room_default
 * - No mentions + cat_led → lead Cat via room_default
 * - No mentions + direct_cat_chat → lead Cat via room_default
 * - @Cat_A → Cat_A via explicit_single
 * - @Cat_A @Cat_B → both via explicit_multi
 * - @UnknownName → appears in unresolvedMentions
 */
export function resolveMentionRoute(
  state: ChatState,
  channelId: string,
  body: string,
  options: {
    allowDefaultTarget: boolean;
    explicitTrigger: RoomRoutingTrigger;
  },
): MentionRouteResult {
  const channel = buildChannelView(state, channelId);
  const defaultTarget = resolveRoomDefaultRoutingTarget(state, channel);
  const ignoredMentionNames = isDirectLaneChannel(channel)
    && defaultTarget.participant?.participantKind === 'cat'
    ? [defaultTarget.participant.participantName]
    : [];
  const mentionNames = parseMentions(body, {
    excludedNames: ignoredMentionNames,
  });
  const activeCats = activeAssignedParticipants(channel);
  const catsByName = new Map(activeCats.map((cat) => [cat.name.toLowerCase(), cat]));
  const orchestratorTarget = buildOrchestratorTarget(state, channel);
  const isDirectLane = isDirectLaneChannel(channel);
  const orchestratorMentionAliases = new Set([
    ORCHESTRATOR_NAME.toLowerCase(),
    orchestratorTarget.participantName.toLowerCase(),
  ]);
  const targets: RoutingTarget[] = [];
  const unresolved: string[] = [];

  if (mentionNames.length === 0) {
    const targets = options.allowDefaultTarget && defaultTarget.target
      ? [defaultTarget.target]
      : [];
    const resolution = targets.length > 0
      ? createRouteResolution({
          defaultTarget,
          routingMode: 'room_default',
          selectionKind: 'default_target',
        })
      : createRouteResolution({
          defaultTarget,
          routingMode: 'room_default',
          selectionKind: 'blocked',
          blockedReason: defaultTarget.blockedReason ?? 'no_valid_targets',
          note: defaultTarget.note ?? 'No valid room targets were resolved for this turn.',
        });
    return {
      targets,
      unresolvedMentions: unresolved,
      parsedMentionNames: mentionNames,
      trigger: 'room_default',
      routingMode: 'room_default',
      resolution,
    };
  }

  for (const mentionName of mentionNames) {
    const normalizedMention = mentionName.toLowerCase();
    if (orchestratorMentionAliases.has(normalizedMention)) {
      if (isDirectLane) {
        unresolved.push(mentionName);
        continue;
      }
      const key = `${orchestratorTarget.participantKind}:${orchestratorTarget.participantId}`;
      if (!targets.some((t) => `${t.participantKind}:${t.participantId}` === key)) {
        targets.push(orchestratorTarget);
      }
      continue;
    }

    const cat = catsByName.get(normalizedMention);
    if (!cat) {
      unresolved.push(mentionName);
      continue;
    }

    if (!targets.some((t) => t.participantId === cat.participantId)) {
      targets.push(buildCatTarget(cat));
    }
  }

  const routingMode: MentionRoutingMode =
    targets.length === 0
      ? 'room_default'
      : targets.length === 1
        ? 'explicit_single'
        : 'explicit_multi';

  return {
    targets,
    unresolvedMentions: unresolved,
    parsedMentionNames: mentionNames,
    trigger: options.explicitTrigger,
    routingMode,
    resolution: targets.length === 0
      ? createRouteResolution({
          defaultTarget,
          routingMode,
          selectionKind: 'blocked',
          blockedReason: 'no_valid_targets',
          note: 'No valid room targets matched the explicit mentions for this turn.',
        })
      : createRouteResolution({
          defaultTarget,
          routingMode,
          selectionKind: 'explicit_mentions',
        }),
  };
}
