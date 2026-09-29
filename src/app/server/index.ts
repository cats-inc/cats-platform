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
import { McpSessionGrantStore } from '../../platform/mcp/sessionGrants.js';
import {
  CODE_AGENT_TOOLS_MCP_PATH,
  type CodeAgentToolGrantBinding,
} from '../../products/code/agentTools/contracts.js';
import { createCodeAgentToolsClientWrapper } from '../../products/code/agentTools/runtimeClientWrapper.js';
import { createCodeAgentToolsService } from '../../products/code/agentTools/service.js';
import { readCodePreviewServersEnabled } from '../../shared/platformPreferences.js';
import { getDefaultArtifactCanvasRenderIntentHub } from '../../products/shared/artifactCanvas/renderIntent.js';
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
  const codeAgentToolGrants = new McpSessionGrantStore<CodeAgentToolGrantBinding>();
  let codeAgentToolsEndpoint: string | null = null;
  const codeAgentToolsClients = createCodeAgentToolsClientWrapper({
    grants: codeAgentToolGrants,
    endpoint: () => codeAgentToolsEndpoint,
  });
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
    shared: { ...dependencies.shared, managedPlugins: plugins, runtimeClient: plugins.wrapClient(knowledge.wrapClient(codeAgentToolsClients.wrapClient(dependencies.shared.runtimeClient))) },
    ...(dependencies.code?.runtimeClient ? { code: { ...dependencies.code, runtimeClient: plugins.wrapClient(knowledge.wrapClient(codeAgentToolsClients.wrapClient(dependencies.code.runtimeClient))) } } : {}),
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

  // Internal bearer MCP precedes Platform cookie auth. The public ingress
  // rejects this route before dispatch, including traffic from a loopback tunnel.
  const codeAgentTools = createCodeAgentToolsService({
    coreStore: resolvedDependencies.code.coreStore,
    livePreviewSupervisor: resolvedDependencies.code.livePreviewSupervisor,
    previewServersEnabled: () => readCodePreviewServersEnabled(resolvedDependencies.shared.config.chatStatePath),
    grants: codeAgentToolGrants,
    policyConfig: resolvedDependencies.shared.config.artifactCanvas,
    now: resolvedDependencies.shared.now,
  });

  const dispatchProduct = async (request: IncomingMessage, response: ServerResponse) => {
    const entry = platformRequestEntry(request);
    if (entry && appComponents && await appComponents.route(request, response, entry.origin)) return;
    // An opaque App frame can only use its App view grant, never Platform cookies.
    if (request.headers.origin === 'null') {
      sendJson(response, 403, { error: 'opaque_origin_denied' }); return;
    }
    if (await codeAgentTools.route(request, response)) return;
    if (await knowledge.route(request, response)) return;
    await routeRequest(request, response, resolvedDependencies);
  };
  const dispatch = async (request: IncomingMessage, response: ServerResponse) => {
    response.on('close', () => openStreams.delete(response));
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const serializedSetup = pathname === '/api/setup/reset' || pathname === '/api/platform/setup/complete';
    if (resetting && !serializedSetup) {
      sendJson(response, 503, { error: { code: 'platform_reset_in_progress', message: 'Platform data reset is in progress.' } });
      return;
    }
    const task = dispatchProduct(request, response);
    // Setup mutations already share a mutex; counting queued setup callers here
    // would deadlock reset/completion. Both local and public ingress use this guard.
    if (!serializedSetup) activeRequests.add(task);
    try { await task; }
    finally {
      activeRequests.delete(task);
      if (!serializedSetup && !response.writableEnded && !response.destroyed) openStreams.add(response);
    }
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

  resolvedDependencies.shared.withPlatformDataReset = async operation => {
    const chat = resolvedDependencies.chat;
    const golden = chat.transportWorkGoldenPath;
    if (!startupSettled || livePreviewSweepPending || activeRequests.size || chat.mutationGate.isIdle?.() === false
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
        codeAgentTools.clearForReset();
        getDefaultArtifactCanvasRenderIntentHub().clearForReset();
        await resolvedDependencies.code.livePreviewSupervisor?.clearForReset();
        if (resolvedDependencies.code.livePreviewStore !== resolvedDependencies.code.livePreviewSupervisor) {
          await resolvedDependencies.code.livePreviewStore?.clearForReset?.();
        }
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
  const livePreviewSupervisor = resolvedDependencies.code.livePreviewSupervisor;
  let livePreviewSweep: ReturnType<typeof setInterval> | undefined;
  let livePreviewSweepPending: Promise<unknown> | undefined;
  let hostingClose: Promise<void> | undefined;
  const closeAppHosting = () => {
    clearInterval(livePreviewSweep);
    return hostingClose ??= Promise.allSettled([
      ingress?.close(), appComponents?.close(), livePreviewSupervisor?.stopAll('platform_shutdown'),
    ]).then(results => {
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Hosted service cleanup failed.');
    });
  };

  server.on('listening', () => {
    appHostingReady = Promise.all([appComponents?.restore(), ingress?.restore()]).then(() => {});
    void appHostingReady.catch(reportUnhandledServerError);
    livePreviewSweep = setInterval(() => {
      if (resetting || livePreviewSweepPending) return;
      livePreviewSweepPending = livePreviewSupervisor?.expireLeases().catch(reportUnhandledServerError)
        .finally(() => { livePreviewSweepPending = undefined; });
    }, 60_000);
    livePreviewSweep.unref();
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
      codeAgentToolsEndpoint = `http://${host}:${address.port}${CODE_AGENT_TOOLS_MCP_PATH}`;
    }
  });

  server.on('close', () => {
    void closeAppHosting().catch(reportUnhandledServerError);
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
  return Object.assign(server, { startupRecovery, appHostingReady: () => appHostingReady, closeAppHosting });
}
