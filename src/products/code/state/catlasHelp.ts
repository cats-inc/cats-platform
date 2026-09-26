import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { CoreStore } from '../../../core/store.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { CatlasAdviceError, inferCatlasAdvice } from '../../../platform/catlas/inference.js';
import { loadCatlasKnowledge, selectCatlasKnowledge } from '../../../platform/catlas/knowledge.js';
import { readGuideCatAssistConfig } from '../../../shared/guideCatAssistStore.js';
import { createTranslator, messageKeys } from '../../../shared/i18n/index.js';
import type {
  CodeCatlasHelpReason, CodeCatlasHelpRequest, CodeCatlasHelpResponse,
} from '../shared/catlasHelp.js';

export interface CodeCatlasHelpService {
  help(request: CodeCatlasHelpRequest, signal: AbortSignal): Promise<CodeCatlasHelpResponse>;
}

export function basicCodeCatlasHelp(
  request: CodeCatlasHelpRequest,
  reason: CodeCatlasHelpReason,
): CodeCatlasHelpResponse {
  const t = createTranslator(request.locale);
  return {
    source: 'basic', reason, knowledgeIds: [], receipt: null,
    advice: t(messageKeys.codeCatlasHelpBasic),
  };
}

async function observeWorkspace(cwd: string | null, runtimeUrl: string) {
  if (!cwd) return 'unselected';
  try {
    const host = new URL(runtimeUrl).hostname;
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) return 'remote_unverified';
    if (!isAbsolute(cwd)) return 'unavailable';
    return (await stat(cwd)).isDirectory() ? 'directory' : 'unavailable';
  } catch { return 'unavailable'; }
}

export function createCodeCatlasHelpService(options: {
  coreStore: CoreStore;
  runtimeClient: RuntimeClient;
  chatStatePath: string;
  platformDir?: string;
  knowledgeFilePath?: string;
  timeoutMs?: number;
  now?: () => Date;
}): CodeCatlasHelpService {
  // One admitted request per host service. No background refresh or automatic retries.
  let active = false;
  return {
    async help(request, signal) {
      if (active) return basicCodeCatlasHelp(request, 'busy');
      if (signal.aborted) return basicCodeCatlasHelp(request, 'cancelled');
      active = true;
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs ?? 90_000);
      const task = (async (): Promise<CodeCatlasHelpResponse> => {
        try {
          const [core, config, knowledge] = await Promise.all([
            options.coreStore.readCore(),
            readGuideCatAssistConfig(options.chatStatePath),
            loadCatlasKnowledge({ locale: request.locale, filePath: options.knowledgeFilePath, platformDir: options.platformDir }),
          ]);
          controller.signal.throwIfAborted();
          if (!core.guideCat || core.guideCat.status === 'dismissed'
            || config.disabledSurfaceKeys.includes('code:new:default:default')) {
            return basicCodeCatlasHelp(request, 'catlas_disabled');
          }
          if (knowledge.status !== 'ready') {
            return basicCodeCatlasHelp(request, 'knowledge_unavailable');
          }
          const health = await options.runtimeClient.getHealth();
          if (!health.reachable) return basicCodeCatlasHelp(request, 'runtime_unavailable');
          const target = request.draft.target;
          const [workspace, diagnostics] = await Promise.all([
            observeWorkspace(request.draft.cwd, health.baseUrl),
            target ? options.runtimeClient.getProviderDiagnostics({
              provider: target.provider, instance: target.instance,
              scope: 'availability', probe: 'light',
            }).catch(() => null) : null,
          ]);
          controller.signal.throwIfAborted();
          const provider = diagnostics?.providers.find((entry) =>
            entry.provider === target?.provider
            && (target?.instance ? entry.instance === target.instance : entry.defaultTarget));
          const observation = {
            surface: 'code:new', observedAt: (options.now?.() ?? new Date()).toISOString(),
            runtimeReachable: true,
            draftTarget: target ? {
              provider: target.provider, instance: target.instance, model: target.model,
            } : null,
            targetAvailability: target ? provider?.availability.status ?? 'unknown' : 'unselected',
            workspace: { selection: workspace, inspectionHost: 'platform', gitStatus: 'unknown' },
            requestedPolicy: {
              workspaceKind: request.draft.policy.workspaceKind,
              workspaceAccess: request.draft.policy.workspaceAccess,
              permissionMode: request.draft.policy.permissionMode,
            },
            effectiveSessionAccess: 'not_started',
          };
          const entries = selectCatlasKnowledge(knowledge.bundle,
            ['execution', 'workspace', 'permissions', 'recovery']);
          if (!entries.length) return basicCodeCatlasHelp(request, 'knowledge_unavailable');
          const result = await inferCatlasAdvice({
            runtimeClient: options.runtimeClient, guideCat: core.guideCat,
            locale: request.locale, question: request.question, surface: 'code:new',
            observation, bundle: knowledge.bundle, entries, signal: controller.signal,
          });
          const [latestCore, latestConfig] = await Promise.all([
            options.coreStore.readCore(), readGuideCatAssistConfig(options.chatStatePath),
          ]);
          const latest = latestCore.guideCat;
          if (!latest || latest.status === 'dismissed'
            || latestConfig.disabledSurfaceKeys.includes('code:new:default:default')
            || JSON.stringify([latest.id, latest.executionTarget, latest.modelSelection])
              !== JSON.stringify([core.guideCat.id, core.guideCat.executionTarget,
                core.guideCat.modelSelection])) {
            return basicCodeCatlasHelp(request, 'cancelled');
          }
          return { source: 'model', reason: null, ...result };
        } catch (error) {
          return basicCodeCatlasHelp(request, controller.signal.aborted
            ? timedOut ? 'timeout' : 'cancelled'
            : error instanceof CatlasAdviceError ? 'invalid_response' : 'model_unavailable');
        } finally {
          active = false;
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
        }
      })();
      // Return promptly on disconnect/timeout. A late-created session still reaches
      // the inference function's finally block; keep admission occupied until cleanup.
      return new Promise<CodeCatlasHelpResponse>((resolve) => {
        const finishAborted = () => resolve(basicCodeCatlasHelp(request,
          timedOut ? 'timeout' : 'cancelled'));
        controller.signal.addEventListener('abort', finishAborted, { once: true });
        if (controller.signal.aborted) finishAborted();
        void task.then((result) => {
          controller.signal.removeEventListener('abort', finishAborted);
          resolve(result);
        });
      });
    },
  };
}
