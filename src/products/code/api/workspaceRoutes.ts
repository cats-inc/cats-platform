import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { handleCoreError } from '../../../core/api/shared.js';
import path from 'node:path';
import { CoreConflictError, CoreValidationError } from '../../../core/errors.js';
import { setOwnerEntry } from '../../../core/ownerLifecycle.js';
import { applyCodespaceAction } from '../state/codespaceManagement.js';
import { buildCodeWorkspaceDetailProjection, createCodeWorkspaceId } from './projection.js';
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
  if (context.url.pathname === '/api/code/codespaces/register') {
    if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
    try {
      const body = await readJsonBody<{ path?: unknown; revision?: unknown }>(context.request);
      if (!body || typeof body.path !== 'string' || !path.isAbsolute(body.path)) throw new CoreValidationError('Choose an absolute folder path.');
      const resolved = await resolveCodeWorkspace({ explicitPath: body.path });
      if (!resolved.workspace) throw new CoreValidationError(resolved.error ?? 'Folder not found.');
      const folderPath = resolved.workspace.workspacePath;
      const id = createCodeWorkspaceId(folderPath);
      const core = await context.dependencies.coreStore.updateCore(current => {
        if (body.revision !== (current.ownerLifecycle?.revision ?? 0)) throw new CoreConflictError('Refresh the list and try again.', 'owner_revision_stale');
        return setOwnerEntry(current, 'codespace', id, { path: folderPath, listing: 'visible', deleted: false });
      });
      sendJson(context.response, 200, buildCodeWorkspaceDetailProjection(core, id));
    } catch (error) { handleCoreError(context, error); }
    return true;
  }
  const actionMatch = /^\/api\/code\/codespaces\/([^/]+)\/actions$/u.exec(context.url.pathname);
  if (actionMatch) {
    if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
    try {
      const input = await readJsonBody<Parameters<typeof applyCodespaceAction>[2]>(context.request);
      const id = decodeURIComponent(actionMatch[1]);
      const core = await context.dependencies.coreStore.updateCore(current => applyCodespaceAction(current, id, input, context.dependencies.livePreviewStore));
      sendJson(context.response, 200, buildCodeWorkspaceDetailProjection(core, id));
    } catch (error) { handleCoreError(context, error); }
    return true;
  }
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
