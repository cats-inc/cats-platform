import type {
  ChannelActivationResult,
  ChannelDispatchResult,
  ParticipantSessionStatus,
  SendChannelMessageInput,
  WorkspaceChannelState,
  WorkspaceState,
} from '../shared/app-shell.js';
import type { RuntimeClient, RuntimeSessionInfo } from '../runtime/client.js';
import {
  ORCHESTRATOR_NAME,
  appendMessage,
  parseMentions,
  requireChannel,
  setChannelMemberSession,
  setChannelOrchestratorSession,
  setChannelStatus,
  setChannelWorkspaceCwd,
} from './model.js';
import { buildMemberPrompt, buildOrchestratorPrompt } from './prompts.js';

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

function activeMembers(channel: WorkspaceChannelState) {
  return channel.members.filter((member) => member.status === 'active');
}

function setStartedSession(
  state: WorkspaceState,
  channelId: string,
  target: 'orchestrator' | { memberId: string },
  session: RuntimeSessionInfo,
  now: Date,
): WorkspaceState {
  if (typeof target !== 'string') {
    return setChannelMemberSession(
      state,
      channelId,
      target.memberId,
      {
        sessionId: session.id,
        status: normalizeRuntimeStatus(session.status),
        cwd: session.cwd,
        lastError: null,
      },
      now,
    );
  }

  return setChannelOrchestratorSession(
    state,
    channelId,
    {
      sessionId: session.id,
      status: normalizeRuntimeStatus(session.status),
      cwd: session.cwd,
      lastError: null,
    },
    now,
  );
}

function setErroredSession(
  state: WorkspaceState,
  channelId: string,
  target: 'orchestrator' | { memberId: string },
  message: string,
  now: Date,
): WorkspaceState {
  if (typeof target !== 'string') {
    return setChannelMemberSession(
      state,
      channelId,
      target.memberId,
      {
        status: 'error',
        lastError: message,
      },
      now,
    );
  }

  return setChannelOrchestratorSession(
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
  target: 'orchestrator' | { memberId: string },
  now: Date,
): WorkspaceState {
  if (typeof target !== 'string') {
    return setChannelMemberSession(state, channelId, target.memberId, { status: 'ready' }, now);
  }

  return setChannelOrchestratorSession(state, channelId, { status: 'ready' }, now);
}

function resolveTargets(channel: WorkspaceChannelState, body: string): {
  targets: Array<
    | { kind: 'orchestrator'; id: 'orchestrator'; name: typeof ORCHESTRATOR_NAME; sessionId: string | null }
    | { kind: 'member'; id: string; name: string; sessionId: string | null }
  >;
  unresolved: string[];
} {
  const mentions = parseMentions(body);
  const active = activeMembers(channel);
  const membersByName = new Map(active.map((member) => [member.name.toLowerCase(), member]));
  const targets: Array<
    | { kind: 'orchestrator'; id: 'orchestrator'; name: typeof ORCHESTRATOR_NAME; sessionId: string | null }
    | { kind: 'member'; id: string; name: string; sessionId: string | null }
  > = [];
  const unresolved: string[] = [];

  if (mentions.length === 0) {
    return {
      targets: [
        {
          kind: 'orchestrator',
          id: 'orchestrator',
          name: ORCHESTRATOR_NAME,
          sessionId: channel.orchestratorSession.sessionId,
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
          name: ORCHESTRATOR_NAME,
          sessionId: channel.orchestratorSession.sessionId,
        });
      }
      continue;
    }

    const member = membersByName.get(normalized);
    if (!member) {
      unresolved.push(mention);
      continue;
    }

    if (!targets.some((target) => target.kind === 'member' && target.id === member.id)) {
      targets.push({
        kind: 'member',
        id: member.id,
        name: member.name,
        sessionId: member.session.sessionId,
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
  let channel = requireChannel(nextState, channelId);
  let spawnCwd = spawnCwdFor(channel);
  const workspaceMode = spawnCwd ? 'shared' : null;
  const results: ChannelActivationResult[] = [];

  if (channel.orchestratorSession.sessionId) {
    results.push({
      targetKind: 'orchestrator',
      targetId: 'orchestrator',
      targetName: ORCHESTRATOR_NAME,
      status: 'already_started',
      sessionId: channel.orchestratorSession.sessionId,
    });
  } else {
    try {
      const session = await runtimeClient.createSession({
        provider: nextState.globalOrchestrator.provider,
        model: nextState.globalOrchestrator.model,
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
          body: `${ORCHESTRATOR_NAME} connected to cats-runtime session ${session.id}.`,
        },
        now,
        {
          metadata: { event: 'session_started', targetKind: 'orchestrator', sessionId: session.id },
        },
      ).state;
      results.push({
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        targetName: ORCHESTRATOR_NAME,
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
          body: `Failed to start ${ORCHESTRATOR_NAME}: ${message}`,
        },
        now,
        {
          metadata: { event: 'session_start_failed', targetKind: 'orchestrator' },
        },
      ).state;
      results.push({
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        targetName: ORCHESTRATOR_NAME,
        status: 'error',
        sessionId: null,
        error: message,
      });
    }
  }

  channel = requireChannel(nextState, channelId);
  for (const member of activeMembers(channel)) {
    if (member.session.sessionId) {
      results.push({
        targetKind: 'member',
        targetId: member.id,
        targetName: member.name,
        status: 'already_started',
        sessionId: member.session.sessionId,
      });
      continue;
    }

    try {
      const session = await runtimeClient.createSession({
        provider: member.provider,
        model: member.model,
        cwd: spawnCwd,
        workspaceMode,
      });
      nextState = setStartedSession(nextState, channelId, { memberId: member.id }, session, now);
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
          body: `${member.name} connected to cats-runtime session ${session.id}.`,
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'member',
            targetId: member.id,
            sessionId: session.id,
          },
        },
      ).state;
      results.push({
        targetKind: 'member',
        targetId: member.id,
        targetName: member.name,
        status: 'started',
        sessionId: session.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      nextState = setErroredSession(nextState, channelId, { memberId: member.id }, message, now);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${member.name}: ${message}`,
        },
        now,
        {
          metadata: {
            event: 'session_start_failed',
            targetKind: 'member',
            targetId: member.id,
          },
        },
      ).state;
      results.push({
        targetKind: 'member',
        targetId: member.id,
        targetName: member.name,
        status: 'error',
        sessionId: null,
        error: message,
      });
    }
  }

  const hasStartedSession = results.some(
    (result) => result.status === 'started' || result.status === 'already_started',
  );
  nextState = setChannelStatus(
    nextState,
    channelId,
    hasStartedSession ? 'active' : channel.members.length > 0 ? 'configured' : 'planned',
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

  const channelAfterUserMessage = requireChannel(nextState, channelId);
  const userMessage = channelAfterUserMessage.messages[channelAfterUserMessage.messages.length - 1];
  const { targets, unresolved } = resolveTargets(channelAfterUserMessage, payload.body);
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

    const currentChannel = requireChannel(nextState, channelId);
    let prompt = buildOrchestratorPrompt(
      currentChannel,
      nextState.globalOrchestrator,
      userMessage,
    );

    if (target.kind === 'member') {
      const member = currentChannel.members.find((candidate) => candidate.id === target.id);
      if (!member) {
        results.push({
          targetKind: 'member',
          targetId: target.id,
          targetName: target.name,
          sessionId: target.sessionId,
          status: 'error',
          error: 'Target member no longer exists in the selected channel.',
        });
        continue;
      }

      prompt = buildMemberPrompt(
        currentChannel,
        nextState.globalOrchestrator,
        member,
        userMessage,
      );
    }

    try {
      const runtimeResult = await runtimeClient.sendMessage(target.sessionId, prompt);
      nextState = setReadyAfterMessage(
        nextState,
        channelId,
        target.kind === 'member' ? { memberId: target.id } : 'orchestrator',
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
      nextState = target.kind === 'member'
        ? setChannelMemberSession(
            nextState,
            channelId,
            target.id,
            { status: 'error', lastError: message },
            now,
          )
        : setChannelOrchestratorSession(
            nextState,
            channelId,
            { status: 'error', lastError: message },
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
