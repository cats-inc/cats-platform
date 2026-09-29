import { createServer as createHttpServer, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { ManagedPluginManager, createPluginRuntimePort } from '../../platform/plugins/manager.js';

import { sendJson } from '../../shared/http.js';
import { PlatformResetBusyError } from '../../shared/platformDataReset.js';
import { createEmptySchedulerState } from '../../platform/scheduler/validation.js';

import type { ServerDependencies } from './contracts.js';
import { resolveServerDependencies } from './dependencies.js';
import { routeRequest } from './requestRouter.js';
import { reconcilePollingOnStartup } from './polling.js';
import { clearProviderCachesForReset } from '../../server/routes/providers.js';
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
  function startBackgroundLoops() {
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
      : Object.assign(() => {}, { isIdle: () => true });

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
      : Object.assign(() => {}, { isIdle: () => true });
    return { stopTransportFanout, stopSchedulerLoop, stopCompanionLifeLoop };
  }
  let loops = startBackgroundLoops();
  let resetting = false;
  let startupSettled = false;
  const activeRequests = new Set<Promise<unknown>>();
  const openStreams = new Set<ServerResponse>();

  const server = createHttpServer((request, response) => {
    response.on('close', () => openStreams.delete(response));
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const serializedSetup = pathname === '/api/setup/reset' || pathname === '/api/platform/setup/complete';
    if (resetting && !serializedSetup) {
      sendJson(response, 503, { error: { code: 'platform_reset_in_progress', message: 'Platform data reset is in progress.' } });
      return;
    }
    const task = knowledge.route(request, response).then(handled => {
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
    // Setup mutations already share runExclusiveSetupOperation. Counting queued
    // setup callers here would deadlock reset/completion serialization.
    if (!serializedSetup) {
      activeRequests.add(task);
      void task.finally(() => {
        activeRequests.delete(task);
        if (!response.writableEnded && !response.destroyed) openStreams.add(response);
      });
    }
  });

  resolvedDependencies.shared.withPlatformDataReset = async operation => {
    const chat = resolvedDependencies.chat;
    const golden = chat.transportWorkGoldenPath;
    if (!startupSettled || activeRequests.size || chat.mutationGate.isIdle?.() === false
      || !loops.stopSchedulerLoop.isIdle() || !loops.stopCompanionLifeLoop.isIdle()
      || !loops.stopTransportFanout.isIdle() || golden?.runner?.isIdle?.() === false
      || golden?.outbox.isIdle?.() === false) throw new PlatformResetBusyError();
    resetting = true;
    loops.stopSchedulerLoop();
    loops.stopCompanionLifeLoop();
    loops.stopTransportFanout();
    chat.pollingSupervisor.stopAll();
    try {
      await chat.pollingSupervisor.drain();
      const [state, core] = await Promise.all([chat.chatStore.read(), chat.chatStore.readCore()]);
      if (state.channels.some(channel => channel.roomRouting?.workflow.activeTurn)
        || core.runs.some(run => run.status === 'running')) throw new PlatformResetBusyError();
      await operation(async () => {
        // Streaming handlers return after subscribing. Close their responses as
        // well as revoking auth, so close handlers remove listeners/heartbeats.
        for (const response of openStreams) response.end();
        knowledge.revoke();
        await clearProviderCachesForReset(providerSelectorClient);
        resolvedDependencies.shared.runtimeClientDiagnosticSink?.clearForReset?.();
        resolvedDependencies.shared.providerCapabilityBootstrapDiagnosticSink.clearForReset?.();
        resolvedDependencies.shared.providerCapabilityBootstrapDiagnostics = [];
        await chat.memoryStore.clearForReset?.();
        await chat.companionStore.clearForReset?.();
        await chat.companionActivityStore.clearForReset?.();
        chat.telegramRelay.clearForReset?.();
        chat.pollingSupervisor.clearForReset?.();
        golden?.clearForReset();
        await resolvedDependencies.work.scheduleStore?.writeState(createEmptySchedulerState());
        resolvedDependencies.shared.browserHandoffStore.clearForReset?.();
        resolvedDependencies.shared.actionGrantStore.clearForReset?.();
        await resolvedDependencies.shared.setAuthRecoveryTokenState?.(null);
      });
    } finally {
      resetting = false;
      loops = startBackgroundLoops();
      await reconcilePollingOnStartup(resolvedDependencies).catch(reportUnhandledServerError);
    }
  };

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
    loops.stopSchedulerLoop();
    loops.stopCompanionLifeLoop();
    loops.stopTransportFanout();
    resolvedDependencies.chat.pollingSupervisor.stopAll();
  });

  // Resolution means all best-effort passes settled, not that every pass succeeded.
  // Callers with private state can await this before submitting work or cleaning up.
  const startupRecovery = runServerStartupRecoveryPasses(resolvedDependencies).finally(() => { startupSettled = true; });
  return Object.assign(server, { startupRecovery });
}
