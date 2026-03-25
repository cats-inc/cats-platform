import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import {
  flushObservedRuntimeSessionMemory,
  resolveRuntimeMaintenancePhase,
} from '../../../platform/memory/runtimeMaintenance.js';
import { appendMemoryMaintenanceActivity } from '../../../platform/memory/maintenance.js';
import type { ChatApiRouteContext } from './routeSupport.js';
import { handleRestError, sendRestError } from './routeSupport.js';

async function handleObserveRuntimeSession(
  context: ChatApiRouteContext,
  sessionId: string,
): Promise<void> {
  try {
    const payload = await context.dependencies.runtimeClient.observeSession(sessionId);
    sendJson(context.response, 200, payload);
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleFlushRuntimeSessionMemory(
  context: ChatApiRouteContext,
  sessionId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<{ phase?: 'pre_reset' | 'pre_compaction' }>(context.request).catch(
      () => ({ phase: undefined as 'pre_reset' | 'pre_compaction' | undefined }),
    );
    const requestedPhase = resolveRuntimeMaintenancePhase(body.phase);
    const observed = await context.dependencies.runtimeClient.observeSession(sessionId);
    const result = await flushObservedRuntimeSessionMemory({
      observed,
      requestedPhase,
      memoryService: context.dependencies.memoryService,
      companionStore: context.dependencies.companionStore,
      now: context.dependencies.now?.(),
    });

    if (result.reason === 'no_pending_memory_flush_hooks') {
      sendJson(context.response, 200, {
        sessionId,
        phase: requestedPhase,
        executed: false,
        reason: result.reason,
        flushes: [],
        summary: null,
      });
      return;
    }

    if (result.reason === 'runtime_memory_context_missing') {
      await appendMemoryMaintenanceActivity({
        coreStore: context.dependencies.chatStore,
        trigger: 'runtime_hook',
        status: 'missing_context',
        phase: result.phase,
        sessionId,
        reason: result.phase,
        now: context.dependencies.now?.(),
      });
      sendRestError(
        context,
        409,
        'runtime_memory_context_missing',
        'The runtime session exposes pending memory_flush hooks, but no cats-owned channel or companion context could be resolved.',
      );
      return;
    }

    if (result.phase && result.summary) {
      await appendMemoryMaintenanceActivity({
        coreStore: context.dependencies.chatStore,
        trigger: 'runtime_hook',
        status: 'executed',
        phase: result.phase,
        sessionId,
        channelId: result.targets.channelId,
        catId: result.targets.catId,
        reason: result.phase,
        summary: result.summary,
        now: context.dependencies.now?.(),
      });
    }

    sendJson(context.response, 200, {
      sessionId,
      phase: result.phase,
      executed: true,
      requestedHookCount: result.requestedHookCount,
      flushes: result.flushes,
      summary: result.summary,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRuntimeMcpProxy(context: ChatApiRouteContext): Promise<void> {
  try {
    const body = await readJsonBody<unknown>(context.request);
    const payload = await context.dependencies.runtimeClient.callMcp(body);
    if (payload === null) {
      context.response.statusCode = 204;
      context.response.end();
      return;
    }
    sendJson(context.response, 200, payload);
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeRuntimeBridgeApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  const sessionObserveMatch = matchRoute(
    context.url.pathname,
    /^\/api\/runtime\/sessions\/([^/]+)\/observe$/u,
  );
  if (sessionObserveMatch) {
    if (context.method === 'GET') {
      await handleObserveRuntimeSession(context, sessionObserveMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const sessionFlushMatch = matchRoute(
    context.url.pathname,
    /^\/api\/runtime\/sessions\/([^/]+)\/memory-flush$/u,
  );
  if (sessionFlushMatch) {
    if (context.method === 'POST') {
      await handleFlushRuntimeSessionMemory(context, sessionFlushMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  if (context.url.pathname === '/api/runtime/mcp') {
    if (context.method === 'POST') {
      await handleRuntimeMcpProxy(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  return false;
}
