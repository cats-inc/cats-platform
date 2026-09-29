import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AppComponentHost } from '../../platform/apps/componentHost.js';
import { PlatformIngress } from '../../platform/apps/platformIngress.js';
import { platformRequestEntry, setPlatformRequestEntry, canonicalIngressPath } from '../../platform/apps/ingressBoundary.js';
import { resolvePlatformStorageLayout } from '../../shared/platformPaths.js';
import { summarizePlatformIngress } from './platformIngressSummary.js';
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
  const desktopAppsKey = dependencies.shared.desktopAppsKey ?? process.env.CATS_DESKTOP_APPS_KEY;
  const appComponents = dependencies.shared.appComponents ?? (/^[a-f0-9]{64}$/.test(desktopAppsKey ?? '')
    ? new AppComponentHost({ chatStatePath: dependencies.shared.config.chatStatePath, ownerId: 'desktop-owner' }) : undefined);
  dependencies = { ...dependencies, shared: { ...dependencies.shared, appComponents, desktopAppsKey } };
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

  const dispatch = async (request: IncomingMessage, response: ServerResponse) => {
    const entry = platformRequestEntry(request);
    if (entry && appComponents && await appComponents.route(request, response, entry.origin)) return;
    // An opaque App frame can only use its App view grant, never Platform cookies.
    if (request.headers.origin === 'null') {
      sendJson(response, 403, { error: 'opaque_origin_denied' }); return;
    }
    if (!await knowledge.route(request, response)) await routeRequest(request, response, resolvedDependencies);
  };
  let localOrigins: string[] = [];
  const server = createHttpServer((request, response) => {
    const origin = [...localOrigins, ...resolvedDependencies.shared.config.auth.allowedBrowserOrigins]
      .find(value => new URL(value).host === request.headers.host);
    if (origin) setPlatformRequestEntry(request, origin, false);
    if ((request.url ?? '').startsWith('/apps/') && (!origin || !canonicalIngressPath(request.url!))) {
      sendJson(response, 400, { error: 'invalid_app_entry' }); return;
    }
    void dispatch(request, response).catch((error) => {
      reportUnhandledServerError(error);
      sendJson(response, 500, {
        error: {
          code: 'internal_error',
          message: 'Unexpected server error',
        },
      });
    });
  });

  const auth = resolvedDependencies.shared.config.auth;
  const configuredOrigins = [...auth.allowedBrowserOrigins];
  const ingress = resolvedDependencies.shared.platformIngress ?? (appComponents ? new PlatformIngress({
    platformDir: resolvePlatformStorageLayout(dependencies.shared.config.chatStatePath).platformDir,
    dispatch,
    ready: async () => auth.mode !== 'unsafe_disabled' && !!auth.sessionSecret
      && !!(await resolvedDependencies.shared.coreStore.readCore()).setupCompleteAt
      && (await resolvedDependencies.shared.authStore.readStateStatus()).status === 'ready',
    onOrigin: origin => { auth.allowedBrowserOrigins = [...new Set([...configuredOrigins, ...(origin ? [origin] : [])])]; },
  }) : undefined);
  resolvedDependencies.shared.platformIngress = ingress;
  if (ingress) appComponents?.setIngressSnapshot(() => ingress.snapshot());
  let appHostingReady = Promise.resolve();

  server.on('listening', () => {
    appHostingReady = Promise.all([appComponents?.restore(), ingress?.restore()]).then(() => {});
    void appHostingReady.catch(reportUnhandledServerError);
    void plugins.tick().catch(reportUnhandledServerError);
    pluginTimer = setInterval(() => { void plugins.tick().catch(reportUnhandledServerError); }, 10_000);
    pluginTimer.unref();
    const address = server.address();
    if (address && typeof address !== 'string') {
      const urls = summarizePlatformIngress({ host: dependencies.shared.config.host, port: address.port }).urls;
      localOrigins = [...urls.localUrls, ...urls.lanUrls, ...urls.overlayUrls,
        `http://127.0.0.1:${address.port}`, `http://localhost:${address.port}`, `http://[::1]:${address.port}`];
    }
    const runtimeUrl = dependencies.shared.config.runtimeBaseUrl;
    const runtimeHost = typeof runtimeUrl === 'string' && URL.canParse(runtimeUrl)
      ? new URL(runtimeUrl).hostname : '';
    if (address && typeof address !== 'string' && isLoopbackAuthHost(runtimeHost)) {
      const host = address.family === 'IPv6' ? '[::1]' : '127.0.0.1';
      knowledgeEndpoint = `http://${host}:${address.port}${AGENT_KNOWLEDGE_PATH}`;
    }
  });

  server.on('close', () => {
    void ingress?.close().catch(reportUnhandledServerError);
    void appComponents?.close().catch(reportUnhandledServerError);
    clearInterval(pluginTimer);
    knowledge.close();
    stopSchedulerLoop();
    stopCompanionLifeLoop();
    stopTransportFanout();
    resolvedDependencies.chat.pollingSupervisor.stopAll();
  });

  // Resolution means all best-effort passes settled, not that every pass succeeded.
  // Callers with private state can await this before submitting work or cleaning up.
  return Object.assign(server, { startupRecovery: runServerStartupRecoveryPasses(resolvedDependencies),
    appHostingReady: () => appHostingReady,
    closeAppHosting: async () => { await Promise.all([ingress?.close(), appComponents?.close()]); } });
}
