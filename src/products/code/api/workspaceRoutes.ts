import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import {
  resolveCodeWorkspace,
  type ResolveCodeWorkspaceInput,
} from '../state/workspaceResolution.js';
import type { CodeApiRouteContext } from './index.js';
import { CODE_API_CODESPACE_RESOLVE_PATH } from '../shared/apiPaths.js';

interface ResolveWorkspaceBody {
  path?: string | null;
  conversationRepoPath?: string | null;
  roomWorkspacePath?: string | null;
}

export async function routeCodeWorkspaceApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== CODE_API_CODESPACE_RESOLVE_PATH) {
    return false;
  }

  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  let body: ResolveWorkspaceBody;
  try {
    body = await readJsonBody<ResolveWorkspaceBody>(context.request);
  } catch {
    sendJson(context.response, 400, {
      error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
    });
    return true;
  }

  const input: ResolveCodeWorkspaceInput = {
    explicitPath: body.path,
    conversationRepoPath: body.conversationRepoPath,
    roomWorkspacePath: body.roomWorkspacePath,
  };

  const result = await resolveCodeWorkspace(input);

  sendJson(context.response, result.resolved ? 200 : 422, result);
  return true;
}
