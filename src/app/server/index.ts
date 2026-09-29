import { createServer as createHttpServer } from 'node:http';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { ManagedPluginManager, createPluginRuntimePort } from '../../platform/plugins/manager.js';

import { sendJson } from '../../shared/http.js';

import type { ServerDependencies } from './contracts.js';
import { resolveServerDependencies } from './dependencies.js';
import { routeRequest } from './requestRouter.js';
import { createAgentKnowledgeBridge, AGENT_KNOWLEDGE_PATH } from '../../platform/knowledge/agentKnowledgeBridge.js';
import { isLoopbackAuthHost } from '../../platform/auth/effectiveMode.js';
import { runServerStartupRecoveryPasses } from './startupRecovery.js';
import { startTransportFanout } from '../../platform/transports/fanout/subscriber.js';
import { startChatCompanionLifeLoop } from '../../products/chat/api/index.js';
import {
  createSchedulerService,
  startSchedulerLoop,
} from '../../platform/scheduler/index.js';
import {
  cancelScheduledRunThroughSupervision,
  launchScheduledRunThroughSupervision,
} from '../../platform/supervision/scheduledRunExecution.js';

export type { ServerDependencies } from './contracts.js';

function reportUnhandledServerError(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-platform-server] unhandled_route_error: ${message}\n`);
}

export function createServer(dependencies: ServerDependencies) {
  const pluginConfig = dependencies.shared.config;
  const plugins = dependencies.shared.managedPlugins ?? new ManagedPluginManager(pluginConfig.platformDir,
    pluginConfig.managedPluginPolicy === true && Boolean(pluginConfig.platformDir) && resolve(pluginConfig.platformDir) !== resolve(join(homedir(), '.cats', 'platform')),
    createPluginRuntimePort(pluginConfig.runtimeBaseUrl, pluginConfig.managedPluginKey ?? pluginConfig.runtimeApiKey));
  const providerSelectorClient = dependencies.shared.runtimeClient;
  let knowledgeEndpoint: string | null = null;
  const knowledge = createAgentKnowledgeBridge({
    platformDir: dependencies.shared.config.platformDir,
    endpoint: () => knowledgeEndpoint,
    async resolveSource(sessionId, input) {
      const meta = input.context?.metadata;
      if (meta?.supervisionProduct !== 'cats-chat' || meta.supervisionSurface !== 'runtime-dispatch'
        || meta.supervisionToolName !== 'cats.runtime.message.send'
        || typeof meta.supervisionRunId !== 'string' || typeof meta.sourceMessageId !== 'string') return null;
      const state = await dependencies.chat.chatStore.read();
      const channel = state.channels.find(row => row.id === meta.supervisionRunId);
      if (!channel || channel.status !== 'active' || !channel.messages.some(row => row.id === meta.sourceMessageId)) return null;
      return `Agent contribution: conversation ${channel.id}; session ${sessionId}`.slice(0, 190);
    },
  });
  dependencies = {
    ...dependencies,
    shared: { ...dependencies.shared, managedPlugins: plugins, runtimeClient: plugins.wrapClient(knowledge.wrapClient(dependencies.shared.runtimeClient)) },
    ...(dependencies.code?.runtimeClient ? { code: { ...dependencies.code, runtimeClient: plugins.wrapClient(knowledge.wrapClient(dependencies.code.runtimeClient)) } } : {}),
    ...(dependencies.work?.runtimeClient ? { work: { ...dependencies.work, runtimeClient: plugins.wrapClient(knowledge.wrapClient(dependencies.work.runtimeClient)) } } : {}),
  };
  const resolvedDependencies = resolveServerDependencies(dependencies);
  let pluginTimer: ReturnType<typeof setInterval> | undefined;
  resolvedDependencies.shared.providerSelectorClient = providerSelectorClient;
  const stopTransportFanout = startTransportFanout({
    eventHub: resolvedDependencies.chat.eventHub,
    chatStore: resolvedDependencies.chat.chatStore,
    telegramRelay: resolvedDependencies.chat.telegramRelay,
    now: resolvedDependencies.shared.now,
  });
  const stopSchedulerLoop = resolvedDependencies.work.scheduleStore
    ? startSchedulerLoop({
        service: createSchedulerService({
          scheduleStore: resolvedDependencies.work.scheduleStore,
          coreStore: resolvedDependencies.work.coreStore,
          now: resolvedDependencies.work.now,
          replaceActiveRun: async (request) => {
            await cancelScheduledRunThroughSupervision({
              coreStore: resolvedDependencies.work.coreStore,
              runtimeClient: resolvedDependencies.work.runtimeClient,
              evidenceDataDir: resolvedDependencies.work.evidenceDataDir,
              now: () => new Date(request.requestedAt),
            }, request.runId, {
              requestedAt: request.requestedAt,
              reasonNote: [
                `Replaced by schedule rule ${request.ruleId}`,
                `trigger ${request.triggerReceiptId}.`,
              ].join(' '),
            });
          },
        }),
        async onTickResult(result) {
          for (const admission of result.results) {
            if (admission.status !== 'admitted' || !admission.run) {
              continue;
            }
            await launchScheduledRunThroughSupervision({
              coreStore: resolvedDependencies.work.coreStore,
              runtimeClient: resolvedDependencies.work.runtimeClient,
              evidenceDataDir: resolvedDependencies.work.evidenceDataDir,
              now: resolvedDependencies.work.now,
            }, admission.run.id);
          }
        },
      })
    : () => {};

  const stopCompanionLifeLoop = resolvedDependencies.chat.startCompanionLifeLoop
    ? startChatCompanionLifeLoop({
        chatStore: resolvedDependencies.chat.chatStore,
        mutationGate: resolvedDependencies.chat.mutationGate,
        runtimeClient: resolvedDependencies.shared.runtimeClient,
        companionStore: resolvedDependencies.chat.companionStore,
        companionActivityStore: resolvedDependencies.chat.companionActivityStore,
        memoryService: resolvedDependencies.chat.memoryService,
        config: resolvedDependencies.shared.config,
        eventHub: resolvedDependencies.chat.eventHub,
        now: resolvedDependencies.shared.now,
      })
    : () => {};

  const server = createHttpServer((request, response) => {
    void knowledge.route(request, response).then(handled => {
      if (!handled) return routeRequest(request, response, resolvedDependencies);
    }).catch((error) => {
      reportUnhandledServerError(error);
      sendJson(response, 500, {
        error: {
          code: 'internal_error',
          message: 'Unexpected server error',
        },
      });
    });
  });

  server.on('listening', () => {
    void plugins.tick().catch(reportUnhandledServerError);
    pluginTimer = setInterval(() => { void plugins.tick().catch(reportUnhandledServerError); }, 10_000);
    pluginTimer.unref();
    const address = server.address();
    const runtimeUrl = dependencies.shared.config.runtimeBaseUrl;
    const runtimeHost = typeof runtimeUrl === 'string' && URL.canParse(runtimeUrl)
      ? new URL(runtimeUrl).hostname : '';
    if (address && typeof address !== 'string' && isLoopbackAuthHost(runtimeHost)) {
      const host = address.family === 'IPv6' ? '[::1]' : '127.0.0.1';
      knowledgeEndpoint = `http://${host}:${address.port}${AGENT_KNOWLEDGE_PATH}`;
    }
  });

  server.on('close', () => {
    clearInterval(pluginTimer);
    knowledge.close();
    stopSchedulerLoop();
    stopCompanionLifeLoop();
    stopTransportFanout();
    resolvedDependencies.chat.pollingSupervisor.stopAll();
  });

  // Resolution means all best-effort passes settled, not that every pass succeeded.
  // Callers with private state can await this before submitting work or cleaning up.
  return Object.assign(server, { startupRecovery: runServerStartupRecoveryPasses(resolvedDependencies) });
}
