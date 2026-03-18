import type {
  ChannelActivationResult,
  ChannelDispatchResult,
  ParticipantSessionStatus,
  SendChannelMessageInput,
  WorkspaceChannelPal,
  WorkspaceChannelState,
  WorkspaceState,
} from '../shared/app-shell.js';
import type { RuntimeClient, RuntimeSessionInfo } from '../runtime/client.js';
import {
  ORCHESTRATOR_NAME,
  appendMessage,
  buildChannelView,
  parseMentions,
  requireChannel,
  resolveOrchestratorDisplayName,
  setChannelOrchestratorLease,
  setChannelPalLease,
  setChannelStatus,
  setChannelWorkspaceCwd,
} from './model.js';
import { buildOrchestratorPrompt, buildPalPrompt } from './prompts.js';

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

function spawnCwdFor(channel: WorkspaceChannelState): string | null {
  return channel.repoPath ?? channel.workspaceCwd ?? null;
}

function activeAssignedPals(channel: { assignedPals: WorkspaceChannelPal[] }) {
  return channel.assignedPals.filter((pal) => pal.status === 'active');
}

function setStartedSession(
  state: WorkspaceState,
  channelId: string,
  target: 'orchestrator' | { palId: string },
  session: RuntimeSessionInfo,
  now: Date,
): WorkspaceState {
  const timestamp = now.toISOString();
  if (typeof target !== 'string') {
    return setChannelPalLease(
      state,
      channelId,
      target.palId,
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
  state: WorkspaceState,
  channelId: string,
  target: 'orchestrator' | { palId: string },
  message: string,
  now: Date,
): WorkspaceState {
  if (typeof target !== 'string') {
    return setChannelPalLease(
      state,
      channelId,
      target.palId,
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
  state: WorkspaceState,
  channelId: string,
  target: 'orchestrator' | { palId: string },
  now: Date,
): WorkspaceState {
  if (typeof target !== 'string') {
    return setChannelPalLease(
      state,
      channelId,
      target.palId,
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

function resolveTargets(state: WorkspaceState, channelId: string, body: string): {
  targets: Array<
    | { kind: 'orchestrator'; id: 'orchestrator'; name: string; sessionId: string | null }
    | { kind: 'pal'; id: string; name: string; sessionId: string | null }
  >;
  unresolved: string[];
} {
  const channel = buildChannelView(state, channelId);
  const mentions = parseMentions(body);
  const activePals = activeAssignedPals(channel);
  const palsByName = new Map(activePals.map((pal) => [pal.name.toLowerCase(), pal]));
  const orchestratorDisplayName = resolveOrchestratorDisplayName(state);
  const targets: Array<
    | { kind: 'orchestrator'; id: 'orchestrator'; name: string; sessionId: string | null }
    | { kind: 'pal'; id: string; name: string; sessionId: string | null }
  > = [];
  const unresolved: string[] = [];

  if (mentions.length === 0) {
    return {
      targets: [
        {
          kind: 'orchestrator',
          id: 'orchestrator',
          name: orchestratorDisplayName,
          sessionId: channel.orchestratorLease.sessionId,
        },
      ],
      unresolved,
    };
  }

  for (const mention of mentions) {
    const normalized = mention.toLowerCase();
    if (normalized === 'orchestrator') {
      if (!targets.some((target) => target.kind === 'orchestrator')) {
        targets.push({
          kind: 'orchestrator',
          id: 'orchestrator',
          name: orchestratorDisplayName,
          sessionId: channel.orchestratorLease.sessionId,
        });
      }
      continue;
    }

    const pal = palsByName.get(normalized);
    if (!pal) {
      unresolved.push(mention);
      continue;
    }

    if (!targets.some((target) => target.kind === 'pal' && target.id === pal.palId)) {
      targets.push({
        kind: 'pal',
        id: pal.palId,
        name: pal.name,
        sessionId: pal.execution.lease.sessionId,
      });
    }
  }

  return { targets, unresolved };
}

export async function activateChannelSessions(
  state: WorkspaceState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
): Promise<{ state: WorkspaceState; results: ChannelActivationResult[] }> {
  let nextState = state;
  let channelState = requireChannel(nextState, channelId);
  let channelView = buildChannelView(nextState, channelId);
  let spawnCwd = spawnCwdFor(channelState);
  const workspaceMode = spawnCwd ? 'shared' : null;
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
        model: nextState.globalOrchestrator.executionTarget.model,
        cwd: spawnCwd,
        workspaceMode,
      });
      nextState = setStartedSession(nextState, channelId, 'orchestrator', session, now);
      if (!spawnCwd && session.cwd) {
        spawnCwd = session.cwd;
        nextState = setChannelWorkspaceCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `${orchestratorDisplayName} connected to cats-runtime session ${session.id}.`,
        },
        now,
        {
          metadata: { event: 'session_started', targetKind: 'orchestrator', sessionId: session.id, verbosity: 'verbose' },
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
  for (const pal of activeAssignedPals(channelView)) {
    if (pal.execution.lease.sessionId) {
      results.push({
        targetKind: 'pal',
        targetId: pal.palId,
        targetName: pal.name,
        status: 'already_started',
        sessionId: pal.execution.lease.sessionId,
      });
      continue;
    }

    try {
      const session = await runtimeClient.createSession({
        provider: pal.execution.target.provider,
        model: pal.execution.target.model,
        cwd: spawnCwd,
        workspaceMode,
      });
      nextState = setStartedSession(nextState, channelId, { palId: pal.palId }, session, now);
      if (!spawnCwd && session.cwd) {
        spawnCwd = session.cwd;
        nextState = setChannelWorkspaceCwd(nextState, channelId, session.cwd, now);
      }
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `${pal.name} connected to cats-runtime session ${session.id}.`,
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'pal',
            targetId: pal.palId,
            sessionId: session.id,
            verbosity: 'verbose',
          },
        },
      ).state;
      results.push({
        targetKind: 'pal',
        targetId: pal.palId,
        targetName: pal.name,
        status: 'started',
        sessionId: session.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      nextState = setErroredSession(nextState, channelId, { palId: pal.palId }, message, now);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${pal.name}: ${message}`,
        },
        now,
        {
          metadata: {
            event: 'session_start_failed',
            targetKind: 'pal',
            targetId: pal.palId,
          },
        },
      ).state;
      results.push({
        targetKind: 'pal',
        targetId: pal.palId,
        targetName: pal.name,
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
    hasStartedSession ? 'active' : channelState.palAssignments.length > 0 ? 'configured' : 'planned',
    now,
  );

  return { state: nextState, results };
}

export async function routeChannelMessage(
  state: WorkspaceState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
): Promise<{ state: WorkspaceState; results: ChannelDispatchResult[] }> {
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
  const userMessage =
    channelAfterUserMessage.messages[channelAfterUserMessage.messages.length - 1];
  const { targets, unresolved } = resolveTargets(nextState, channelId, payload.body);
  const results: ChannelDispatchResult[] = [];

  if (unresolved.length > 0) {
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: `Unresolved mentions: ${unresolved.map((item) => `@${item}`).join(', ')}`,
      },
      now,
      {
        metadata: { event: 'unresolved_mentions', mentions: unresolved },
      },
    ).state;
  }

  if (targets.length === 0) {
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: 'No routing targets matched this message. Mention someone or activate the coordinator first.',
      },
      now,
      {
        metadata: { event: 'routing_skipped' },
      },
    ).state;
    return { state: nextState, results };
  }

  for (const target of targets) {
    if (!target.sessionId) {
      results.push({
        targetKind: target.kind,
        targetId: target.id,
        targetName: target.name,
        sessionId: null,
        status: 'skipped',
        error: 'Target has no active session. Activate the channel first.',
      });
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Chat',
          body: `${target.name} has no active session yet. Activate the chat before routing work.`,
        },
        now,
        {
          metadata: {
            event: 'routing_skipped',
            targetKind: target.kind,
            targetId: target.id,
          },
        },
      ).state;
      continue;
    }

    const currentChannel = buildChannelView(nextState, channelId);
    let prompt = buildOrchestratorPrompt(
      currentChannel,
      nextState.globalOrchestrator,
      userMessage,
    );

    if (target.kind === 'pal') {
      const pal = currentChannel.assignedPals.find((candidate) => candidate.palId === target.id);
      if (!pal) {
        results.push({
          targetKind: 'pal',
          targetId: target.id,
          targetName: target.name,
          sessionId: target.sessionId,
          status: 'error',
          error: 'Target pal is no longer assigned to the selected chat.',
        });
        continue;
      }

      prompt = buildPalPrompt(
        currentChannel,
        nextState.globalOrchestrator,
        pal,
        userMessage,
      );
    }

    try {
      const runtimeResult = await runtimeClient.sendMessage(target.sessionId, prompt);
      nextState = setReadyAfterMessage(
        nextState,
        channelId,
        target.kind === 'pal' ? { palId: target.id } : 'orchestrator',
        now,
      );
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: target.kind === 'orchestrator' ? 'orchestrator' : 'agent',
          senderName: target.name,
          body: runtimeResult.content || `${target.name} completed the routed turn without text output.`,
        },
        now,
        {
          metadata: {
            event: 'runtime_response',
            targetKind: target.kind,
            targetId: target.id,
            sessionId: target.sessionId,
          },
          usage: {
            inputTokens: runtimeResult.inputTokens,
            outputTokens: runtimeResult.outputTokens,
            tokensUsed: runtimeResult.tokensUsed,
          },
          incrementUnread: false,
        },
      ).state;
      results.push({
        targetKind: target.kind,
        targetId: target.id,
        targetName: target.name,
        sessionId: target.sessionId,
        status: 'sent',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      nextState = target.kind === 'pal'
        ? setChannelPalLease(
            nextState,
            channelId,
            target.id,
            { status: 'error', lastError: message, lastUsedAt: now.toISOString() },
            now,
          )
        : setChannelOrchestratorLease(
            nextState,
            channelId,
            { status: 'error', lastError: message, lastUsedAt: now.toISOString() },
            now,
          );
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to route the message to ${target.name}: ${message}`,
        },
        now,
        {
          metadata: {
            event: 'runtime_error',
            targetKind: target.kind,
            targetId: target.id,
            sessionId: target.sessionId,
          },
        },
      ).state;
      results.push({
        targetKind: target.kind,
        targetId: target.id,
        targetName: target.name,
        sessionId: target.sessionId,
        status: 'error',
        error: message,
      });
    }
  }

  return { state: nextState, results };
}
