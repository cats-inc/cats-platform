/**
 * Deterministic mention routing — system-layer routing decisions based on
 * @mentions in message text, independent of prompt engineering.
 *
 * SPEC-018: Direct Cat Chat and Conversation Routing Layer
 * SPEC-026: Explicit Mentions and Dynamic Room Workflow Orchestration
 */

import type {
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  ChatChannelCat,
  ChatChannelView,
  ChatState,
} from '../../../shared/app-shell.js';
import {
  ORCHESTRATOR_NAME,
  buildChannelView,
  resolveOrchestratorDisplayName,
} from './model.js';
import { parseMentions } from './mentionParsing.js';

export type MentionRoutingMode = 'room_default' | 'explicit_single' | 'explicit_multi';

export interface RoutingTarget extends RoomRoutingParticipantRef {
  sessionId: string | null;
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
}

function activeAssignedCats(channel: { assignedCats: ChatChannelCat[] }) {
  return channel.assignedCats.filter((cat) => cat.status === 'active');
}

function buildOrchestratorTarget(state: ChatState, channel: ChatChannelView): RoutingTarget {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: resolveOrchestratorDisplayName(state),
    sessionId: channel.orchestratorLease.sessionId,
  };
}

function buildCatTarget(cat: ChatChannelCat): RoutingTarget {
  return {
    participantKind: 'cat',
    participantId: cat.catId,
    participantName: cat.name,
    sessionId: cat.execution.lease.sessionId,
  };
}

function resolveDefaultTarget(state: ChatState, channel: ChatChannelView): RoutingTarget {
  const routing = channel.roomRouting ?? null;

  if (routing?.mode === 'direct_cat_chat' && routing.leadParticipantId) {
    const leadCat = activeAssignedCats(channel)
      .find((cat) => cat.catId === routing.leadParticipantId);
    if (leadCat) {
      return buildCatTarget(leadCat);
    }
  }

  return buildOrchestratorTarget(state, channel);
}

/**
 * Resolve routing targets from message text using deterministic mention parsing.
 *
 * This is the system-layer routing decision — it runs BEFORE any prompt
 * construction and produces a structured result that the dispatch loop consumes.
 *
 * Routing rules:
 * - No mentions + boss_chat → Boss Cat (orchestrator) via room_default
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
  const mentionNames = parseMentions(body);
  const activeCats = activeAssignedCats(channel);
  const catsByName = new Map(activeCats.map((cat) => [cat.name.toLowerCase(), cat]));
  const orchestratorTarget = buildOrchestratorTarget(state, channel);
  const orchestratorMentionAliases = new Set([
    ORCHESTRATOR_NAME.toLowerCase(),
    orchestratorTarget.participantName.toLowerCase(),
  ]);
  const targets: RoutingTarget[] = [];
  const unresolved: string[] = [];

  if (mentionNames.length === 0) {
    return {
      targets: options.allowDefaultTarget ? [resolveDefaultTarget(state, channel)] : [],
      unresolvedMentions: unresolved,
      parsedMentionNames: mentionNames,
      trigger: 'room_default',
      routingMode: 'room_default',
    };
  }

  for (const mentionName of mentionNames) {
    const normalizedMention = mentionName.toLowerCase();
    if (orchestratorMentionAliases.has(normalizedMention)) {
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

    if (!targets.some((t) => t.participantId === cat.catId)) {
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
  };
}
