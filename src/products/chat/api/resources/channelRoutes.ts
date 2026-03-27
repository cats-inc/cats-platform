import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  activateChannelSessions,
  routeChannelMessage,
} from '../../state/runtimeActions.js';
import {
  buildChannelView,
  requireChannel,
  setChannelPendingExecutionTarget,
  toChannelSummary,
} from '../../state/model/index.js';
import type {
  CreateChatChannelInput,
  SendChannelMessageInput,
  UpdateChannelInput,
} from '../contracts.js';
import {
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  maybeAutoResumeRecoveredOrchestratorContinuation,
  nowFrom,
  persistCreatedChannel,
  persistDeletedChannel,
  persistRenamedChannel,
  requireValidChatScopeId,
  sendChannelExport,
  sendRestError,
  type ChatApiRouteContext,
} from '../routeSupport.js';

function sanitizeAttachmentName(rawName: string): string {
  const basename = path.basename(rawName).trim();
  const normalized = basename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '');

  if (!normalized || normalized === '.' || normalized === '..') {
    return 'attachment';
  }

  return normalized;
}

async function resolveUniqueAttachmentName(
  directory: string,
  rawName: string,
  reservedNames: Set<string>,
): Promise<string> {
  const sanitizedName = sanitizeAttachmentName(rawName);
  const parsed = path.parse(sanitizedName);
  const baseName = parsed.name || 'attachment';
  const extension = parsed.ext;

  let attempt = 0;
  while (true) {
    const candidate = attempt === 0
      ? `${baseName}${extension}`
      : `${baseName}-${attempt + 1}${extension}`;

    if (reservedNames.has(candidate)) {
      attempt += 1;
      continue;
    }

    try {
      await access(path.join(directory, candidate));
      attempt += 1;
      continue;
    } catch {
      reservedNames.add(candidate);
      return candidate;
    }
  }
}

const CHANNEL_STREAM_SESSION_WAIT_MS = 1500;
const CHANNEL_STREAM_SESSION_POLL_MS = 75;

function resolveChannelStreamSessionId(
  channel: ReturnType<typeof requireChannel>,
): string | null {
  const leadParticipantId = channel.roomRouting?.leadParticipantId ?? null;
  if (leadParticipantId) {
    const leadAssignment = channel.catAssignments.find((assignment) =>
      assignment.catId === leadParticipantId);
    const leadSessionId = leadAssignment?.execution?.lease?.sessionId?.trim();
    if (leadSessionId) {
      return leadSessionId;
    }
  }

  for (const assignment of channel.catAssignments) {
    const sessionId = assignment.execution?.lease?.sessionId?.trim();
    if (sessionId) {
      return sessionId;
    }
  }

  return channel.orchestratorLease?.sessionId?.trim() || null;
}

function waitForStreamLease(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);

    function onAbort(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitForChannelStreamSessionId(
  context: ChatApiRouteContext,
  channelId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const deadline = Date.now() + CHANNEL_STREAM_SESSION_WAIT_MS;

  while (!signal.aborted) {
    const state = await context.dependencies.chatStore.read();
    const channel = requireChannel(state, channelId);
    const sessionId = resolveChannelStreamSessionId(channel);
    if (sessionId) {
      return sessionId;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await waitForStreamLease(CHANNEL_STREAM_SESSION_POLL_MS, signal);
  }

  return null;
}

function writeSseEvent(
  context: ChatApiRouteContext,
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = typeof data.type === 'string'
    ? data
    : { ...data, type: event };
  context.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function handleRestListChannels(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      channels: state.channels.map((channel) => toChannelSummary(channel)),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestCreateChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<CreateChatChannelInput>(context.request);
    const persisted = await persistCreatedChannel(context, body);
    const createdChannelId = persisted.selectedChannelId;
    if (!createdChannelId) {
      throw new Error('Failed to select created channel');
    }
    sendJson(context.response, 201, {
      channel: buildChannelView(persisted, createdChannelId),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestGetChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      channel: buildChannelView(state, channelId),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestPatchChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<UpdateChannelInput>(context.request);
    let persisted = await context.dependencies.chatStore.read();

    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        sendJson(context.response, 400, { error: 'title_required', message: 'Title must not be empty.' });
        return;
      }
      persisted = await persistRenamedChannel(context, channelId, title);
    }

    if (
      body.pendingProvider !== undefined
      || body.pendingModel !== undefined
      || body.pendingInstance !== undefined
      || body.pendingModelSelection !== undefined
    ) {
      const nextState = setChannelPendingExecutionTarget(persisted, channelId, {
        provider: body.pendingProvider,
        model: body.pendingModel,
        instance: body.pendingInstance,
        modelSelection: body.pendingModelSelection,
      }, nowFrom(context.dependencies));
      persisted = await context.dependencies.chatStore.write(nextState);
    }

    sendJson(context.response, 200, {
      channel: toChannelSummary(requireChannel(persisted, channelId)),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestDeleteChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    await persistDeletedChannel(context, channelId);
    sendJson(context.response, 200, { deleted: true, channelId });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestListMessages(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      messages: requireChannel(state, channelId).messages,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestSendMessage(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<SendChannelMessageInput>(context.request);
    const stateBefore = await context.dependencies.chatStore.read();
    const messageCountBefore = requireChannel(stateBefore, channelId).messages.length;
    const dispatch = await routeChannelMessage(
      stateBefore,
      channelId,
      body,
      context.dependencies.runtimeClient,
      nowFrom(context.dependencies),
      {
        companionStore: context.dependencies.companionStore,
        memoryService: context.dependencies.memoryService,
        chatStore: context.dependencies.chatStore,
        runtimeRecovery: {
          staleSessionRetryLimit: context.dependencies.config.runtimeStaleSessionRetryLimit,
        },
      },
    );
    const persisted = await context.dependencies.chatStore.write(
      dispatch.state,
    );
    const userMessage =
      requireChannel(persisted, channelId).messages[messageCountBefore] ?? null;

    sendJson(context.response, 200, {
      message: userMessage,
      dispatch: {
        channelId,
        results: dispatch.results,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestUploadAttachments(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<{
      files: Array<{ name: string; data: string }>;
    }>(context.request);

    if (!Array.isArray(body.files) || body.files.length === 0) {
      sendRestError(
        context,
        400,
        'attachments_required',
        'No files provided.',
      );
      return;
    }

    const state = await context.dependencies.chatStore.read();
    const channel = requireChannel(state, channelId);
    const cwd = channel.repoPath ?? channel.chatCwd;

    if (!cwd) {
      sendRestError(
        context,
        409,
        'channel_cwd_required',
        'Channel has no working directory. Activate the channel first.',
      );
      return;
    }

    const attachDir = path.join(cwd, '.cats-attachments');
    await mkdir(attachDir, { recursive: true });

    const attachments: Array<{ name: string; relativePath: string }> = [];
    const reservedNames = new Set<string>();

    for (const file of body.files) {
      const safeName = await resolveUniqueAttachmentName(
        attachDir,
        file.name,
        reservedNames,
      );
      const filePath = path.join(attachDir, safeName);
      await writeFile(filePath, Buffer.from(file.data, 'base64'));
      attachments.push({
        name: safeName,
        relativePath: `.cats-attachments/${safeName}`,
      });
    }

    sendJson(context.response, 200, { attachments });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestActivateChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const now = nowFrom(context.dependencies);
    const activation = await activateChannelSessions(
      await context.dependencies.chatStore.read(),
      channelId,
      context.dependencies.runtimeClient,
      now,
      {
        companionStore: context.dependencies.companionStore,
        memoryService: context.dependencies.memoryService,
      },
    );
    await context.dependencies.chatStore.write(activation.state);
    if (activation.results.some((result) =>
      result.targetKind === 'orchestrator' && result.status === 'started')) {
      await maybeAutoResumeRecoveredOrchestratorContinuation(context, channelId, now);
    }
    sendJson(context.response, 200, {
      activation: {
        channelId,
        startedAt: now.toISOString(),
        results: activation.results,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestStreamChannel(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  let sseHeadersSent = false;
  const abortController = new AbortController();
  context.response.on('close', () => abortController.abort());

  try {
    requireValidChatScopeId(chatScopeId);
    const sessionId = await waitForChannelStreamSessionId(
      context,
      channelId,
      abortController.signal,
    );

    if (abortController.signal.aborted) {
      return;
    }

    context.response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    sseHeadersSent = true;

    if (!sessionId) {
      writeSseEvent(context, 'session_closed', { type: 'session_closed' });
      context.response.end();
      return;
    }

    try {
      await context.dependencies.runtimeClient.streamSession(
        sessionId,
        async (event) => {
          if (abortController.signal.aborted || context.response.writableEnded) {
            return;
          }
          writeSseEvent(context, event.event, event.data);
        },
        {
          signal: abortController.signal,
        }
      );
    } catch {
      if (!abortController.signal.aborted && !context.response.writableEnded) {
        writeSseEvent(context, 'error', {
          type: 'error',
          text: 'Runtime stream unavailable',
        });
      }
    }

    if (!context.response.writableEnded) {
      context.response.end();
    }
  } catch (error) {
    if (sseHeadersSent) {
      try {
        writeSseEvent(context, 'error', {
          type: 'error',
          text: 'Proxy error',
        });
      } catch { /* response may already be closed */ }
      if (!context.response.writableEnded) context.response.end();
    } else {
      handleRestError(context, error);
    }
  }
}

async function handleRestGetExport(
  context: ChatApiRouteContext,
  chatScopeId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    sendChannelExport(
      context,
      await context.dependencies.chatStore.read(),
      channelId,
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatChannelResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/channels') {
    if (context.method === 'GET') {
      await handleRestListChannels(context, DEFAULT_CHAT_SCOPE_ID);
      return true;
    }
    if (context.method === 'POST') {
      await handleRestCreateChannel(context, DEFAULT_CHAT_SCOPE_ID);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const canonicalChannelMessagesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/messages$/u,
  );
  if (canonicalChannelMessagesMatch) {
    if (context.method === 'GET') {
      await handleRestListMessages(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelMessagesMatch[0]!,
      );
      return true;
    }
    if (context.method === 'POST') {
      await handleRestSendMessage(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelMessagesMatch[0]!,
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const canonicalChannelAttachmentsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/attachments$/u,
  );
  if (canonicalChannelAttachmentsMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestUploadAttachments(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelAttachmentsMatch[0]!,
    );
    return true;
  }

  const canonicalChannelActivationsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/activations$/u,
  );
  if (canonicalChannelActivationsMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestActivateChannel(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelActivationsMatch[0]!,
    );
    return true;
  }

  const canonicalChannelStreamMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/stream$/u,
  );
  if (canonicalChannelStreamMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestStreamChannel(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelStreamMatch[0]!,
    );
    return true;
  }

  const canonicalChannelExportMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/exports\/latest$/u,
  );
  if (canonicalChannelExportMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestGetExport(
      context,
      DEFAULT_CHAT_SCOPE_ID,
      canonicalChannelExportMatch[0]!,
    );
    return true;
  }

  const canonicalChannelDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)$/u,
  );
  if (canonicalChannelDetailMatch) {
    if (context.method === 'GET') {
      await handleRestGetChannel(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelDetailMatch[0]!,
      );
      return true;
    }
    if (context.method === 'PATCH') {
      await handleRestPatchChannel(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelDetailMatch[0]!,
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleRestDeleteChannel(
        context,
        DEFAULT_CHAT_SCOPE_ID,
        canonicalChannelDetailMatch[0]!,
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH', 'DELETE']);
    return true;
  }

  return false;
}
