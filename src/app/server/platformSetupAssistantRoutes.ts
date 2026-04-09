import { randomUUID } from 'node:crypto';

import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../shared/http.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';
import { parseAssistantPresetBody, type AssistantPresetBody } from './platformSetupRouteSupport.js';
import {
  createAssistantPreset,
  deleteAssistantPreset,
  updateAssistantPreset,
} from './platformSetupStateMutations.js';

type PlatformSetupContext = RouteContext<ChatApiDependencies>;

async function readAssistantPresetBody(
  context: PlatformSetupContext,
): Promise<{
  name: string;
  provider: string;
  instance: string | null;
  model: string;
  modelSelection: ProviderModelSelection | null;
  roleHint: string | null;
} | null> {
  let body: AssistantPresetBody;
  try {
    body = await readJsonBody<AssistantPresetBody>(context.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(context.response, 400, { error: { code: 'bad_request', message } });
    return null;
  }
  const parsedBody = parseAssistantPresetBody(body);
  if (!parsedBody.ok) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: parsedBody.message },
    });
    return null;
  }
  return parsedBody.value;
}

async function handleAssistantPresetList(
  context: PlatformSetupContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { assistants: core.assistantPresets });
}

async function handleAssistantPresetCreate(
  context: PlatformSetupContext,
): Promise<void> {
  const body = await readAssistantPresetBody(context);
  if (!body) {
    return;
  }

  const nowIso = (context.dependencies.now?.() ?? new Date()).toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  const creation = createAssistantPreset(core, randomUUID(), body, nowIso);
  core = creation.core;

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 201, {
    assistant: creation.assistant,
    assistants: core.assistantPresets,
  });
}

async function handleAssistantPresetUpdate(
  context: PlatformSetupContext,
  assistantId: string,
): Promise<void> {
  const body = await readAssistantPresetBody(context);
  if (!body) {
    return;
  }

  const nowIso = (context.dependencies.now?.() ?? new Date()).toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  const update = updateAssistantPreset(core, assistantId, body, nowIso);
  if (!update) {
    sendJson(context.response, 404, {
      error: { code: 'not_found', message: 'Assistant not found' },
    });
    return;
  }
  core = update.core;

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 200, {
    assistant: update.assistant,
    assistants: core.assistantPresets,
  });
}

async function handleAssistantPresetDelete(
  context: PlatformSetupContext,
  assistantId: string,
): Promise<void> {
  const nowIso = (context.dependencies.now?.() ?? new Date()).toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  const deletion = deleteAssistantPreset(core, assistantId, nowIso);
  if (!deletion) {
    sendJson(context.response, 404, {
      error: { code: 'not_found', message: 'Assistant not found' },
    });
    return;
  }
  core = deletion.core;

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 200, {
    deletedId: deletion.deletedId,
    assistants: core.assistantPresets,
  });
}

export async function routePlatformAssistantPresetApi(
  context: PlatformSetupContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/platform/assistants') {
    if (context.method === 'GET') {
      await handleAssistantPresetList(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleAssistantPresetCreate(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const assistantPresetDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/platform\/assistants\/([^/]+)$/u,
  );
  if (!assistantPresetDetailMatch) {
    return false;
  }

  if (context.method === 'PUT') {
    await handleAssistantPresetUpdate(context, assistantPresetDetailMatch[0]!);
    return true;
  }
  if (context.method === 'DELETE') {
    await handleAssistantPresetDelete(context, assistantPresetDetailMatch[0]!);
    return true;
  }
  sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
  return true;
}
