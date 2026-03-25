import { sendMethodNotAllowed, matchRoute, readJsonBody, sendJson } from '../../../shared/http.js';
import {
  buildOrchestratorExecutionLoopResponse,
  buildOrchestratorPlanResponse,
  dispatchOrchestratorTurn,
  type OrchestratorPlanRequest,
} from '../../../platform/orchestration/index.js';
import type { ChatApiRouteContext } from './routeSupport.js';
import { handleRestError } from './routeSupport.js';

async function handlePlan(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<OrchestratorPlanRequest>(context.request);
    const state = await context.dependencies.chatStore.read();
    const core = await context.dependencies.chatStore.readCore();
    context.dependencies.orchestratorPlannerSurface.buildChannelView(state, body.channelId);
    sendJson(
      context.response,
      200,
      buildOrchestratorPlanResponse(
        state,
        core,
        body,
        context.dependencies.orchestratorPlannerSurface,
      ),
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleDispatch(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<OrchestratorPlanRequest>(context.request);
    const response = await dispatchOrchestratorTurn({
      ...body,
      chatStore: context.dependencies.chatStore,
      channelRouter: context.dependencies.orchestratorChannelRouter,
      plannerSurface: context.dependencies.orchestratorPlannerSurface,
      runtimeClient: context.dependencies.runtimeClient,
      now: context.dependencies.now?.(),
      companionStore: context.dependencies.companionStore,
      memoryService: context.dependencies.memoryService,
    });
    sendJson(context.response, 200, response);
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleExecutionLoop(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.chatStore.read();
    context.dependencies.orchestratorPlannerSurface.buildChannelView(state, channelId);
    const core = await context.dependencies.chatStore.readCore();
    sendJson(
      context.response,
      200,
      buildOrchestratorExecutionLoopResponse(
        state,
        core,
        channelId,
        context.dependencies.orchestratorPlannerSurface,
        context.url.searchParams.get('runId'),
      ),
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeOrchestratorApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/orchestrator/plan') {
    if (context.method === 'POST') {
      await handlePlan(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  if (context.url.pathname === '/api/orchestrator/dispatch') {
    if (context.method === 'POST') {
      await handleDispatch(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const executionLoopMatch = matchRoute(
    context.url.pathname,
    /^\/api\/orchestrator\/channels\/([^/]+)\/execution-loop$/u,
  );
  if (executionLoopMatch) {
    if (context.method === 'GET') {
      await handleExecutionLoop(context, executionLoopMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  return false;
}
