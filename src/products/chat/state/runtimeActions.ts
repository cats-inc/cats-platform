import { randomUUID } from 'node:crypto';

import type {
  ChannelActivationResult,
  ChannelDispatchResult,
  MessageUsageSummary,
  ParticipantSessionStatus,
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
  SendChannelMessageInput,
  ChatChannelCat,
  ChatChannelState,
  ChatChannelView,
  ChatMessage,
  ChatState,
} from '../../../shared/app-shell.js';
import type { RuntimeClient, RuntimeSessionInfo } from '../../../platform/runtime/client.js';
import {
  ORCHESTRATOR_NAME,
  appendMessage,
  buildChannelView,
  parseMentions,
  requireChannel,
  resolveOrchestratorDisplayName,
  setChannelOrchestratorLease,
  setChannelCatLease,
  setChannelRoomRouting,
  setChannelStatus,
  setChannelChatCwd,
} from './model.js';
import {
  buildOrchestratorPrompt,
  buildOrchestratorRewritePrompt,
  buildCatPrompt,
  MAX_PROMPT_RECENT_MESSAGES,
} from './prompts.js';
import {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  resolveRoomRoutingState,
} from './roomRouting.js';
import { formatSessionStartedMessage } from './runtimeMessages.js';

type RoutingTarget = RoomRoutingParticipantRef & {
  sessionId: string | null;
};

interface TargetResolution {
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
}

interface DispatchFrame {
  sourceMessage: ChatMessage;
  sourceParticipant: RoomRoutingParticipantRef | null;
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  depth: number;
}

interface DispatchRequest extends DispatchFrame {
  target: RoutingTarget;
}

interface DispatchExecution extends DispatchRequest {
  responseBody: string | null;
  usage: MessageUsageSummary | null;
  error: string | null;
}

const MAX_RECENT_CONTEXT_MESSAGES = MAX_PROMPT_RECENT_MESSAGES;

function normalizeRuntimeStatus(status: string | undefined): ParticipantSessionStatus {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'closed':
      return 'closed';
    case 'error':
      return 'error';
    default:
      return 'initializing';
  }
}

function spawnCwdFor(channel: ChatChannelState): string | null {
  return channel.repoPath ?? channel.chatCwd ?? null;
}

function activeAssignedCats(channel: { assignedCats: ChatChannelCat[] }) {
  return channel.assignedCats.filter((cat) => cat.status === 'active');
}

function shouldRewriteOrchestratorReply(
  content: string,
  orchestratorName: string,
  channel: ChatChannelView,
): boolean {
  if (activeAssignedCats(channel).length > 0) {
    return false;
  }

  const normalized = content.toLowerCase();
  return normalized.includes(`@${orchestratorName.toLowerCase()}`)
    || normalized.includes(`@${ORCHESTRATOR_NAME.toLowerCase()}`);
}

function participantKey(participant: RoomRoutingParticipantRef | RoutingTarget): string {
  return `${participant.participantKind}:${participant.participantId}`;
}

function toParticipantRef(target: RoutingTarget): RoomRoutingParticipantRef {
  return {
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
  };
}

function setStartedSession(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { catId: string },
  session: RuntimeSessionInfo,
  now: Date,
): ChatState {
  const timestamp = now.toISOString();
  if (typeof target !== 'string') {
    return setChannelCatLease(
      state,
      channelId,
      target.catId,
      {
        sessionId: session.id,
        status: normalizeRuntimeStatus(session.status),
        cwd: session.cwd,
        lastError: null,
        provider: session.provider,
        model: session.model,
        startedAt: timestamp,
        lastUsedAt: timestamp,
      },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    {
      sessionId: session.id,
      status: normalizeRuntimeStatus(session.status),
      cwd: session.cwd,
      lastError: null,
      provider: session.provider,
      model: session.model,
      startedAt: timestamp,
      lastUsedAt: timestamp,
    },
    now,
  );
}

function setErroredSession(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { catId: string },
  message: string,
  now: Date,
): ChatState {
  if (typeof target !== 'string') {
    return setChannelCatLease(
      state,
      channelId,
      target.catId,
      {
        status: 'error',
        lastError: message,
      },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    {
      status: 'error',
      lastError: message,
    },
    now,
  );
}

function setReadyAfterMessage(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { catId: string },
  now: Date,
): ChatState {
  if (typeof target !== 'string') {
    return setChannelCatLease(
      state,
      channelId,
      target.catId,
      { status: 'ready', lastUsedAt: now.toISOString() },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    { status: 'ready', lastUsedAt: now.toISOString() },
    now,
  );
}

function buildOrchestratorTarget(
  state: ChatState,
  channel: ChatChannelView,
): RoutingTarget {
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

function resolveDefaultTarget(
  state: ChatState,
  channel: ChatChannelView,
): RoutingTarget {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  if (roomRouting.mode === 'direct_cat_chat' && roomRouting.leadParticipantId) {
    const leadCat = activeAssignedCats(channel).find(
      (cat) => cat.catId === roomRouting.leadParticipantId,
    );
    if (leadCat) {
      return buildCatTarget(leadCat);
    }
  }

  return buildOrchestratorTarget(state, channel);
}

function resolveTargets(
  state: ChatState,
  channelId: string,
  body: string,
  options: {
    allowDefaultTarget: boolean;
    explicitTrigger: RoomRoutingTrigger;
  },
): TargetResolution {
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
      unresolved,
      mentionNames,
      trigger: 'room_default',
    };
  }

  for (const mentionName of mentionNames) {
    const normalizedMention = mentionName.toLowerCase();
    if (orchestratorMentionAliases.has(normalizedMention)) {
      if (!targets.some((target) => participantKey(target) === participantKey(orchestratorTarget))) {
        targets.push(orchestratorTarget);
      }
      continue;
    }

    const cat = catsByName.get(normalizedMention);
    if (!cat) {
      unresolved.push(mentionName);
      continue;
    }

    if (!targets.some((target) => target.participantId === cat.catId)) {
      targets.push(buildCatTarget(cat));
    }
  }

  return {
    targets,
    unresolved,
    mentionNames,
    trigger: options.explicitTrigger,
  };
}

function mergeUnresolvedMentions(outcome: RoomRoutingOutcome, mentions: string[]): void {
  for (const mention of mentions) {
    if (!outcome.unresolvedMentions.includes(mention)) {
      outcome.unresolvedMentions.push(mention);
    }
  }
}

function createRoutingOutcome(
  channel: ChatChannelView,
  sourceMessage: ChatMessage,
  resolution: TargetResolution,
  nowIso: string,
): RoomRoutingOutcome {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  return {
    turnId: randomUUID(),
    mode: roomRouting.mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolvedTargets: resolution.targets.map((target) => toParticipantRef(target)),
    unresolvedMentions: structuredClone(resolution.unresolved),
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: nowIso,
    completedAt: null,
  };
}

function addCheckpoint(
  outcome: RoomRoutingOutcome,
  kind: RoomRoutingCheckpoint['kind'],
  message: string,
  nowIso: string,
  actor: RoomRoutingParticipantRef | null,
  targets: RoomRoutingParticipantRef[] = [],
): RoomRoutingCheckpoint {
  const checkpoint: RoomRoutingCheckpoint = {
    id: randomUUID(),
    kind,
    message,
    actor,
    sourceMessageId: actor ? outcome.sourceMessageId : null,
    targets,
    createdAt: nowIso,
  };
  outcome.checkpoints.push(checkpoint);
  return checkpoint;
}

function messageMatchesTarget(message: ChatMessage, target: RoutingTarget): boolean {
  if (target.participantKind === 'orchestrator') {
    return message.senderKind === 'orchestrator'
      && (
        message.senderName === target.participantName
        || message.metadata.targetKind === 'orchestrator'
      );
  }

  return message.senderKind === 'agent'
    && (
      message.senderName === target.participantName
      || message.metadata.targetId === target.participantId
    );
}

function sliceRecentContextForTarget(
  channel: ChatChannelView,
  target: RoutingTarget,
  sourceMessageId: string,
): ChatMessage[] {
  const sourceIndex = channel.messages.findIndex((message) => message.id === sourceMessageId);
  const boundedSourceIndex = sourceIndex === -1 ? channel.messages.length - 1 : sourceIndex;
  let lastOwnReplyIndex = -1;

  for (let index = boundedSourceIndex - 1; index >= 0; index -= 1) {
    if (messageMatchesTarget(channel.messages[index], target)) {
      lastOwnReplyIndex = index;
      break;
    }
  }

  const startIndex = Math.max(lastOwnReplyIndex + 1, 0);
  const relevantMessages = channel.messages.slice(startIndex, boundedSourceIndex + 1);
  return relevantMessages.slice(-MAX_RECENT_CONTEXT_MESSAGES);
}

function describeRoutingReason(
  channel: ChatChannelView,
  sourceParticipant: RoomRoutingParticipantRef | null,
  trigger: RoomRoutingTrigger,
): string {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  switch (trigger) {
    case 'room_default':
      if (roomRouting.mode === 'direct_cat_chat') {
        return 'System routing selected you because you are the lead cat for this room.';
      }
      return 'System routing selected you as the default room target for this turn.';
    case 'explicit_mention':
      return 'System routing selected you because the operator explicitly mentioned you.';
    case 'continuation_mention':
      return sourceParticipant
        ? `System routing selected you because ${sourceParticipant.participantName} explicitly mentioned you.`
        : 'System routing selected you because another participant explicitly mentioned you.';
    default:
      return 'System routing selected you for this turn.';
  }
}

function buildPromptForTarget(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
): string {
  const channel = buildChannelView(state, channelId);
  const recentMessages = sliceRecentContextForTarget(
    channel,
    request.target,
    request.sourceMessage.id,
  );
  const routingContext = {
    reason: describeRoutingReason(channel, request.sourceParticipant, request.trigger),
    recentMessages,
    sourceParticipantName: request.sourceParticipant?.participantName ?? null,
  };

  if (request.target.participantKind === 'orchestrator') {
    return buildOrchestratorPrompt(
      channel,
      state.globalOrchestrator,
      request.sourceMessage,
      request.target.participantName,
      routingContext,
    );
  }

  const cat = channel.assignedCats.find(
    (candidate) => candidate.catId === request.target.participantId,
  );
  if (!cat) {
    throw new Error(`Target cat is no longer assigned to the selected chat: ${request.target.participantId}`);
  }

  return buildCatPrompt(
    channel,
    state.globalOrchestrator,
    cat,
    request.sourceMessage,
    routingContext,
  );
}

function describeGuardReason(reason: Exclude<RoomRoutingGuardReason, null>): string {
  switch (reason) {
    case 'max_continuations':
      return 'the continuation depth limit';
    case 'max_dispatches':
      return 'the per-turn dispatch limit';
    case 'max_target_visits':
      return 'the per-target revisit limit';
    case 'anti_ping_pong':
      return 'anti-ping-pong protection';
    default:
      return 'a routing guard';
  }
}

async function ensureTargetSession(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  runtimeClient: RuntimeClient,
  now: Date,
): Promise<{
  state: ChatState;
  target: RoutingTarget;
  error: string | null;
}> {
  if (target.sessionId) {
    return { state, target, error: null };
  }

  const channel = buildChannelView(state, channelId);
  const spawnCwd = spawnCwdFor(requireChannel(state, channelId));
  const sharingMode = spawnCwd ? 'shared' : null;
  let nextState = state;

  try {
    if (target.participantKind === 'orchestrator') {
      const session = await runtimeClient.createSession({
        provider: nextState.globalOrchestrator.executionTarget.provider,
        instance: nextState.globalOrchestrator.executionTarget.instance,
        model: nextState.globalOrchestrator.executionTarget.model,
        cwd: spawnCwd,
        sharingMode,
      });
      nextState = setStartedSession(nextState, channelId, 'orchestrator', session, now);
      if (!spawnCwd && session.cwd) {
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(target.participantName, session),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'orchestrator',
            sessionId: session.id,
            verbosity: 'verbose',
          },
          incrementUnread: false,
        },
      ).state;
      return {
        state: nextState,
        target: { ...target, sessionId: session.id },
        error: null,
      };
    }

    const cat = channel.assignedCats.find((candidate) => candidate.catId === target.participantId);
    if (!cat) {
      return {
        state,
        target,
        error: 'Target cat is no longer assigned to the selected chat.',
      };
    }

    const session = await runtimeClient.createSession({
      provider: cat.execution.target.provider,
      instance: cat.execution.target.instance,
      model: cat.execution.target.model,
      cwd: spawnCwd,
      sharingMode,
    });
    nextState = setStartedSession(
      nextState,
      channelId,
      { catId: target.participantId },
      session,
      now,
    );
    if (!spawnCwd && session.cwd) {
      nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
    }
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: formatSessionStartedMessage(target.participantName, session),
      },
      now,
      {
        metadata: {
          event: 'session_started',
          targetKind: 'cat',
          targetId: target.participantId,
          sessionId: session.id,
          verbosity: 'verbose',
        },
        incrementUnread: false,
      },
    ).state;
    return {
      state: nextState,
      target: { ...target, sessionId: session.id },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime error';
    nextState = target.participantKind === 'cat'
      ? setErroredSession(nextState, channelId, { catId: target.participantId }, message, now)
      : setErroredSession(nextState, channelId, 'orchestrator', message, now);
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: `Failed to start ${target.participantName}: ${message}`,
      },
      now,
      {
        metadata: {
          event: 'session_start_failed',
          targetKind: target.participantKind,
          targetId: target.participantId,
        },
      },
    ).state;
    return { state: nextState, target, error: message };
  }
}

async function executeDispatch(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
  runtimeClient: RuntimeClient,
): Promise<DispatchExecution> {
  try {
    const prompt = buildPromptForTarget(state, channelId, request);
    const runtimeResult = await runtimeClient.sendMessage(
      request.target.sessionId ?? '',
      prompt,
    );
    let responseBody = runtimeResult.content
      || `${request.target.participantName} completed the routed turn without text output.`;
    let usage: MessageUsageSummary | null = {
      inputTokens: runtimeResult.inputTokens,
      outputTokens: runtimeResult.outputTokens,
      tokensUsed: runtimeResult.tokensUsed,
    };

    if (request.target.participantKind === 'orchestrator') {
      const channel = buildChannelView(state, channelId);
      if (
        shouldRewriteOrchestratorReply(
          responseBody,
          request.target.participantName,
          channel,
        )
      ) {
        try {
          const rewrite = await runtimeClient.sendMessage(
            request.target.sessionId ?? '',
            buildOrchestratorRewritePrompt(
              channel,
              request.sourceMessage,
              request.target.participantName,
              responseBody,
            ),
          );
          if (rewrite.content) {
            responseBody = rewrite.content;
          }
          usage = {
            inputTokens: (usage?.inputTokens ?? 0) + rewrite.inputTokens,
            outputTokens: (usage?.outputTokens ?? 0) + rewrite.outputTokens,
            tokensUsed: (usage?.tokensUsed ?? 0) + rewrite.tokensUsed,
          };
        } catch {
          // Keep the original draft if the repair pass fails.
        }
      }
    }

    return {
      ...request,
      responseBody,
      usage,
      error: null,
    };
  } catch (error) {
    return {
      ...request,
      responseBody: null,
      usage: null,
      error: error instanceof Error ? error.message : 'Unknown runtime error',
    };
  }
}

async function settleInCompletionOrder<T>(promises: Array<Promise<T>>): Promise<T[]> {
  const wrapped = promises.map((promise, index) =>
    promise.then((value) => ({ index, value })),
  );
  const pending = new Map(wrapped.map((promise, index) => [index, promise]));
  const results: T[] = [];

  while (pending.size > 0) {
    const settled = await Promise.race(pending.values());
    pending.delete(settled.index);
    results.push(settled.value);
  }

  return results;
}

function shouldBlockAntiPingPong(
  sourceParticipant: RoomRoutingParticipantRef,
  target: RoutingTarget,
  dispatches: RoomRoutingOutcome['dispatches'],
): boolean {
  const completedDispatches = dispatches.filter((dispatch) => dispatch.status === 'completed');
  if (completedDispatches.length < 2) {
    return false;
  }

  const lastDispatch = completedDispatches[completedDispatches.length - 1];
  const previousDispatch = completedDispatches[completedDispatches.length - 2];
  if (!lastDispatch.source || !previousDispatch.source) {
    return false;
  }

  return participantKey(previousDispatch.source) === participantKey(sourceParticipant)
    && participantKey(previousDispatch.target) === participantKey(target)
    && participantKey(lastDispatch.source) === participantKey(target)
    && participantKey(lastDispatch.target) === participantKey(sourceParticipant);
}

export async function activateChannelSessions(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
): Promise<{ state: ChatState; results: ChannelActivationResult[] }> {
  let nextState = state;
  let channelState = requireChannel(nextState, channelId);
  let channelView = buildChannelView(nextState, channelId);
  let spawnCwd = spawnCwdFor(channelState);
  const sharingMode = spawnCwd ? 'shared' : null;
  const orchestratorDisplayName = resolveOrchestratorDisplayName(nextState);
  const results: ChannelActivationResult[] = [];

  if (channelState.orchestratorLease.sessionId) {
    results.push({
      targetKind: 'orchestrator',
      targetId: 'orchestrator',
      targetName: orchestratorDisplayName,
      status: 'already_started',
      sessionId: channelState.orchestratorLease.sessionId,
    });
  } else {
    try {
      const session = await runtimeClient.createSession({
        provider: nextState.globalOrchestrator.executionTarget.provider,
        instance: nextState.globalOrchestrator.executionTarget.instance,
        model: nextState.globalOrchestrator.executionTarget.model,
        cwd: spawnCwd,
        sharingMode,
      });
      nextState = setStartedSession(nextState, channelId, 'orchestrator', session, now);
      if (!spawnCwd && session.cwd) {
        spawnCwd = session.cwd;
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(orchestratorDisplayName, session),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'orchestrator',
            sessionId: session.id,
            verbosity: 'verbose',
          },
        },
      ).state;
      results.push({
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        targetName: orchestratorDisplayName,
        status: 'started',
        sessionId: session.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      nextState = setErroredSession(nextState, channelId, 'orchestrator', message, now);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${orchestratorDisplayName}: ${message}`,
        },
        now,
        {
          metadata: { event: 'session_start_failed', targetKind: 'orchestrator' },
        },
      ).state;
      results.push({
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        targetName: orchestratorDisplayName,
        status: 'error',
        sessionId: null,
        error: message,
      });
    }
  }

  channelView = buildChannelView(nextState, channelId);
  for (const cat of activeAssignedCats(channelView)) {
    if (cat.execution.lease.sessionId) {
      results.push({
        targetKind: 'cat',
        targetId: cat.catId,
        targetName: cat.name,
        status: 'already_started',
        sessionId: cat.execution.lease.sessionId,
      });
      continue;
    }

    try {
      const session = await runtimeClient.createSession({
        provider: cat.execution.target.provider,
        instance: cat.execution.target.instance,
        model: cat.execution.target.model,
        cwd: spawnCwd,
        sharingMode,
      });
      nextState = setStartedSession(nextState, channelId, { catId: cat.catId }, session, now);
      if (!spawnCwd && session.cwd) {
        spawnCwd = session.cwd;
        nextState = setChannelChatCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(cat.name, session),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'cat',
            targetId: cat.catId,
            sessionId: session.id,
            verbosity: 'verbose',
          },
        },
      ).state;
      results.push({
        targetKind: 'cat',
        targetId: cat.catId,
        targetName: cat.name,
        status: 'started',
        sessionId: session.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      nextState = setErroredSession(nextState, channelId, { catId: cat.catId }, message, now);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${cat.name}: ${message}`,
        },
        now,
        {
          metadata: {
            event: 'session_start_failed',
            targetKind: 'cat',
            targetId: cat.catId,
          },
        },
      ).state;
      results.push({
        targetKind: 'cat',
        targetId: cat.catId,
        targetName: cat.name,
        status: 'error',
        sessionId: null,
        error: message,
      });
    }
  }

  channelState = requireChannel(nextState, channelId);
  const hasStartedSession = results.some(
    (result) => result.status === 'started' || result.status === 'already_started',
  );
  nextState = setChannelStatus(
    nextState,
    channelId,
    hasStartedSession ? 'active' : channelState.catAssignments.length > 0 ? 'configured' : 'planned',
    now,
  );

  return { state: nextState, results };
}

export async function routeChannelMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  let nextState = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: payload.senderName?.trim() || 'User',
      body: payload.body,
    },
    now,
  ).state;

  const channelAfterUserMessage = buildChannelView(nextState, channelId);
  const userMessage = channelAfterUserMessage.messages[channelAfterUserMessage.messages.length - 1];
  const initialResolution = resolveTargets(nextState, channelId, payload.body, {
    allowDefaultTarget: true,
    explicitTrigger: 'explicit_mention',
  });
  const results: ChannelDispatchResult[] = [];
  const nowIso = now.toISOString();
  const channelRouting = requireChannel(nextState, channelId).roomRouting;
  const roomRouting = resolveRoomRoutingState(channelRouting);
  const maxContinuations = roomRouting.maxContinuations ?? DEFAULT_MAX_ROUTING_CONTINUATIONS;
  const maxDispatches = roomRouting.maxDispatchesPerTurn ?? DEFAULT_MAX_ROUTING_DISPATCHES;
  const maxTargetVisits =
    roomRouting.maxTargetVisitsPerTurn ?? DEFAULT_MAX_ROUTING_TARGET_VISITS;
  const outcome = createRoutingOutcome(channelAfterUserMessage, userMessage, initialResolution, nowIso);
  let latestCheckpoint = addCheckpoint(
    outcome,
    'turn_started',
    'System routing started a new room turn.',
    nowIso,
    null,
    initialResolution.targets.map((target) => toParticipantRef(target)),
  );

  if (initialResolution.unresolved.length > 0) {
    mergeUnresolvedMentions(outcome, initialResolution.unresolved);
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: `Unresolved mentions: ${initialResolution.unresolved.map((item) => `@${item}`).join(', ')}`,
      },
      now,
      {
        metadata: {
          event: 'unresolved_mentions',
          mentions: initialResolution.unresolved,
        },
      },
    ).state;
  }

  if (initialResolution.targets.length === 0) {
    latestCheckpoint = addCheckpoint(
      outcome,
      'no_targets',
      'No valid room targets were resolved for this turn.',
      nowIso,
      null,
    );
    outcome.status = 'blocked';
    outcome.completedAt = nowIso;
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: 'No routing targets matched this message. Mention someone or let the room default target handle it.',
      },
      now,
      {
        metadata: { event: 'routing_skipped' },
      },
    ).state;
    nextState = setChannelRoomRouting(
      nextState,
      channelId,
      {
        ...resolveRoomRoutingState(requireChannel(nextState, channelId).roomRouting),
        lastOutcome: outcome,
        lastCheckpoint: latestCheckpoint,
      },
      now,
    );
    return { state: nextState, results };
  }

  const queue: DispatchFrame[] = [
    {
      sourceMessage: userMessage,
      sourceParticipant: null,
      targets: initialResolution.targets,
      unresolved: initialResolution.unresolved,
      mentionNames: initialResolution.mentionNames,
      trigger: initialResolution.trigger,
      depth: 0,
    },
  ];
  const targetVisitCounts = new Map<string, number>();
  let guardReason: RoomRoutingGuardReason = null;

  while (queue.length > 0) {
    const frame = queue.shift();
    if (!frame) {
      break;
    }

    const allowedRequests: DispatchRequest[] = [];
    for (const target of frame.targets) {
      if (outcome.totalDispatchCount >= maxDispatches) {
        guardReason = 'max_dispatches';
        latestCheckpoint = addCheckpoint(
          outcome,
          'loop_guard',
          `Room routing stopped after reaching ${describeGuardReason('max_dispatches')}.`,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
        );
        break;
      }

      const targetKey = participantKey(target);
      if ((targetVisitCounts.get(targetKey) ?? 0) >= maxTargetVisits) {
        const blockedError = `${target.participantName} already reached the per-turn revisit limit.`;
        outcome.dispatches.push({
          id: randomUUID(),
          sourceMessageId: frame.sourceMessage.id,
          source: frame.sourceParticipant,
          target: toParticipantRef(target),
          trigger: frame.trigger,
          status: 'blocked',
          mentionNames: structuredClone(frame.mentionNames),
          responseMessageId: null,
          startedAt: nowIso,
          completedAt: nowIso,
          error: blockedError,
        });
        latestCheckpoint = addCheckpoint(
          outcome,
          'loop_guard',
          `${target.participantName} was blocked after reaching ${describeGuardReason('max_target_visits')}.`,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
        );
        if (frame.targets.length === 1 && queue.length === 0) {
          guardReason = 'max_target_visits';
        }
        results.push({
          targetKind: target.participantKind,
          targetId: target.participantId,
          targetName: target.participantName,
          sessionId: target.sessionId,
          status: 'skipped',
          error: blockedError,
          sourceMessageId: frame.sourceMessage.id,
          trigger: frame.trigger,
          dispatchDepth: frame.depth,
        });
        continue;
      }

      if (
        frame.sourceParticipant
        && shouldBlockAntiPingPong(frame.sourceParticipant, target, outcome.dispatches)
      ) {
        const blockedError = `Blocked a routing ping-pong between ${frame.sourceParticipant.participantName} and ${target.participantName}.`;
        outcome.dispatches.push({
          id: randomUUID(),
          sourceMessageId: frame.sourceMessage.id,
          source: frame.sourceParticipant,
          target: toParticipantRef(target),
          trigger: frame.trigger,
          status: 'blocked',
          mentionNames: structuredClone(frame.mentionNames),
          responseMessageId: null,
          startedAt: nowIso,
          completedAt: nowIso,
          error: blockedError,
        });
        latestCheckpoint = addCheckpoint(
          outcome,
          'anti_ping_pong',
          blockedError,
          nowIso,
          frame.sourceParticipant,
          [toParticipantRef(target)],
        );
        if (frame.targets.length === 1 && queue.length === 0) {
          guardReason = 'anti_ping_pong';
        }
        results.push({
          targetKind: target.participantKind,
          targetId: target.participantId,
          targetName: target.participantName,
          sessionId: target.sessionId,
          status: 'skipped',
          error: blockedError,
          sourceMessageId: frame.sourceMessage.id,
          trigger: frame.trigger,
          dispatchDepth: frame.depth,
        });
        continue;
      }

      allowedRequests.push({
        ...frame,
        target,
      });
    }

    if (guardReason === 'max_dispatches') {
      break;
    }
    if (allowedRequests.length === 0) {
      if (guardReason) {
        break;
      }
      continue;
    }

    if (allowedRequests.length > 1) {
      latestCheckpoint = addCheckpoint(
        outcome,
        'fan_out',
        `Fan-out routed this step to ${allowedRequests.map((request) => request.target.participantName).join(', ')}.`,
        nowIso,
        frame.sourceParticipant,
        allowedRequests.map((request) => toParticipantRef(request.target)),
      );
    }

    const readyRequests: DispatchRequest[] = [];
    for (const request of allowedRequests) {
      const ensured = await ensureTargetSession(
        nextState,
        channelId,
        request.target,
        runtimeClient,
        now,
      );
      nextState = ensured.state;
      if (ensured.error) {
        outcome.dispatches.push({
          id: randomUUID(),
          sourceMessageId: request.sourceMessage.id,
          source: request.sourceParticipant,
          target: toParticipantRef(request.target),
          trigger: request.trigger,
          status: 'error',
          mentionNames: structuredClone(request.mentionNames),
          responseMessageId: null,
          startedAt: nowIso,
          completedAt: nowIso,
          error: ensured.error,
        });
        latestCheckpoint = addCheckpoint(
          outcome,
          'runtime_error',
          `Failed to wake ${request.target.participantName}: ${ensured.error}`,
          nowIso,
          request.sourceParticipant,
          [toParticipantRef(request.target)],
        );
        results.push({
          targetKind: request.target.participantKind,
          targetId: request.target.participantId,
          targetName: request.target.participantName,
          sessionId: null,
          status: 'error',
          error: ensured.error,
          sourceMessageId: request.sourceMessage.id,
          trigger: request.trigger,
          dispatchDepth: request.depth,
        });
        continue;
      }

      readyRequests.push({
        ...request,
        target: ensured.target,
      });
    }

    if (readyRequests.length === 0) {
      continue;
    }

    const stateSnapshot = nextState;
    const executions = await settleInCompletionOrder(
      readyRequests.map((request) =>
        executeDispatch(stateSnapshot, channelId, request, runtimeClient),
      ),
    );

    for (const execution of executions) {
      outcome.totalDispatchCount += 1;
      const targetKey = participantKey(execution.target);
      targetVisitCounts.set(targetKey, (targetVisitCounts.get(targetKey) ?? 0) + 1);

      if (execution.error) {
        nextState = execution.target.participantKind === 'cat'
          ? setChannelCatLease(
              nextState,
              channelId,
              execution.target.participantId,
              { status: 'error', lastError: execution.error, lastUsedAt: nowIso },
              now,
            )
          : setChannelOrchestratorLease(
              nextState,
              channelId,
              { status: 'error', lastError: execution.error, lastUsedAt: nowIso },
              now,
            );
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to route the message to ${execution.target.participantName}: ${execution.error}`,
          },
          now,
          {
            metadata: {
              event: 'runtime_error',
              targetKind: execution.target.participantKind,
              targetId: execution.target.participantId,
              sessionId: execution.target.sessionId,
            },
          },
        ).state;
        outcome.dispatches.push({
          id: randomUUID(),
          sourceMessageId: execution.sourceMessage.id,
          source: execution.sourceParticipant,
          target: toParticipantRef(execution.target),
          trigger: execution.trigger,
          status: 'error',
          mentionNames: structuredClone(execution.mentionNames),
          responseMessageId: null,
          startedAt: nowIso,
          completedAt: nowIso,
          error: execution.error,
        });
        latestCheckpoint = addCheckpoint(
          outcome,
          'runtime_error',
          `Runtime delivery to ${execution.target.participantName} failed: ${execution.error}`,
          nowIso,
          execution.sourceParticipant,
          [toParticipantRef(execution.target)],
        );
        results.push({
          targetKind: execution.target.participantKind,
          targetId: execution.target.participantId,
          targetName: execution.target.participantName,
          sessionId: execution.target.sessionId,
          status: 'error',
          error: execution.error,
          sourceMessageId: execution.sourceMessage.id,
          trigger: execution.trigger,
          dispatchDepth: execution.depth,
        });
        continue;
      }

      nextState = setReadyAfterMessage(
        nextState,
        channelId,
        execution.target.participantKind === 'cat'
          ? { catId: execution.target.participantId }
          : 'orchestrator',
        now,
      );
      const appendedResponse = appendMessage(
        nextState,
        channelId,
        {
          senderKind: execution.target.participantKind === 'orchestrator'
            ? 'orchestrator'
            : 'agent',
          senderName: execution.target.participantName,
          body: execution.responseBody ?? '',
        },
        now,
        {
          metadata: {
            event: 'runtime_response',
            targetKind: execution.target.participantKind,
            targetId: execution.target.participantId,
            sessionId: execution.target.sessionId,
            turnId: outcome.turnId,
            sourceMessageId: execution.sourceMessage.id,
            routingTrigger: execution.trigger,
            dispatchDepth: execution.depth,
          },
          usage: execution.usage,
          incrementUnread: false,
        },
      );
      nextState = appendedResponse.state;
      const responseMessage = appendedResponse.message;
      outcome.dispatches.push({
        id: randomUUID(),
        sourceMessageId: execution.sourceMessage.id,
        source: execution.sourceParticipant,
        target: toParticipantRef(execution.target),
        trigger: execution.trigger,
        status: 'completed',
        mentionNames: structuredClone(execution.mentionNames),
        responseMessageId: responseMessage.id,
        startedAt: nowIso,
        completedAt: nowIso,
        error: null,
      });
      results.push({
        targetKind: execution.target.participantKind,
        targetId: execution.target.participantId,
        targetName: execution.target.participantName,
        sessionId: execution.target.sessionId,
        status: 'sent',
        sourceMessageId: execution.sourceMessage.id,
        trigger: execution.trigger,
        dispatchDepth: execution.depth,
      });

      const continuationResolution = resolveTargets(nextState, channelId, responseMessage.body, {
        allowDefaultTarget: false,
        explicitTrigger: 'continuation_mention',
      });
      if (continuationResolution.unresolved.length > 0) {
        mergeUnresolvedMentions(outcome, continuationResolution.unresolved);
      }

      if (continuationResolution.targets.length === 0) {
        if (continuationResolution.unresolved.length > 0) {
          latestCheckpoint = addCheckpoint(
            outcome,
            'no_targets',
            `No valid continuation targets were resolved from ${execution.target.participantName}'s handoff.`,
            nowIso,
            toParticipantRef(execution.target),
          );
        }
        continue;
      }

      if (execution.depth + 1 > maxContinuations) {
        guardReason = 'max_continuations';
        latestCheckpoint = addCheckpoint(
          outcome,
          'loop_guard',
          `Room routing stopped after reaching ${describeGuardReason('max_continuations')}.`,
          nowIso,
          toParticipantRef(execution.target),
          continuationResolution.targets.map((target) => toParticipantRef(target)),
        );
        break;
      }

      outcome.continuationCount += 1;
      latestCheckpoint = addCheckpoint(
        outcome,
        'continuation',
        `${execution.target.participantName} handed the room forward to ${continuationResolution.targets.map((target) => target.participantName).join(', ')}.`,
        nowIso,
        toParticipantRef(execution.target),
        continuationResolution.targets.map((target) => toParticipantRef(target)),
      );
      queue.push({
        sourceMessage: responseMessage,
        sourceParticipant: toParticipantRef(execution.target),
        targets: continuationResolution.targets,
        unresolved: continuationResolution.unresolved,
        mentionNames: continuationResolution.mentionNames,
        trigger: continuationResolution.trigger,
        depth: execution.depth + 1,
      });
    }

    if (guardReason) {
      break;
    }
  }

  outcome.guard = guardReason;
  outcome.status = guardReason
    ? 'blocked'
    : outcome.dispatches.some((dispatch) => dispatch.status === 'completed')
      ? 'completed'
      : 'error';
  outcome.completedAt = nowIso;
  latestCheckpoint = addCheckpoint(
    outcome,
    'completed',
    guardReason
      ? `Room routing stopped because it hit ${describeGuardReason(guardReason)}.`
      : 'Room routing completed for this turn.',
    nowIso,
    null,
  );
  nextState = setChannelRoomRouting(
    nextState,
    channelId,
    {
      ...resolveRoomRoutingState(requireChannel(nextState, channelId).roomRouting),
      lastOutcome: outcome,
      lastCheckpoint: latestCheckpoint,
    },
    now,
  );

  return { state: nextState, results };
}
