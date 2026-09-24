import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { validateRuntimeSessionPolicyInput } from '../../../shared/runtimeSessionPolicy.js';
import { CODE_CATLAS_HELP_PATH, type CodeCatlasHelpRequest } from '../shared/catlasHelp.js';
import { basicCodeCatlasHelp } from '../state/catlasHelp.js';
import type { CodeApiRouteContext } from './index.js';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value: unknown, max: number): boolean {
  return value === null || (typeof value === 'string' && value.length <= max
    && !/[\x00-\x1f]/u.test(value));
}

export function isCodeCatlasHelpRequest(value: unknown): value is CodeCatlasHelpRequest {
  if (!record(value) || typeof value.locale !== 'string' || !['en', 'zh-TW'].includes(value.locale)
    || typeof value.question !== 'string' || !value.question.trim() || value.question.length > 1_000
    || !record(value.draft) || !optionalText(value.draft.cwd, 4_096)
    || !record(value.draft.policy)) return false;
  const { policy, target } = value.draft;
  if (policy.workspaceKind == null || policy.workspaceAccess == null || policy.permissionMode == null
    || validateRuntimeSessionPolicyInput(policy)) return false;
  return target === null || (record(target)
    && typeof target.provider === 'string' && /^[a-z][a-z0-9.-]{0,63}$/u.test(target.provider)
    && optionalText(target.instance, 120) && optionalText(target.model, 200));
}

export async function routeCodeCatlasHelpApi(context: CodeApiRouteContext): Promise<boolean> {
  if (context.url.pathname !== CODE_CATLAS_HELP_PATH) return false;
  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }
  let body: unknown;
  try { body = await readJsonBody<unknown>(context.request); } catch { body = null; }
  if (!isCodeCatlasHelpRequest(body)) {
    sendJson(context.response, 400, {
      error: { code: 'invalid_catlas_help_request', message: 'Invalid Code help request.' },
    });
    return true;
  }
  const controller = new AbortController();
  const onClose = () => { if (!context.response.writableEnded) controller.abort(); };
  context.response.once('close', onClose);
  try {
    const result = context.dependencies.catlasHelp
      ? await context.dependencies.catlasHelp.help(body, controller.signal)
      : basicCodeCatlasHelp(body, 'model_unavailable');
    if (!controller.signal.aborted) sendJson(context.response, 200, result, { 'Cache-Control': 'no-store' });
  } finally {
    context.response.removeListener('close', onClose);
  }
  return true;
}
