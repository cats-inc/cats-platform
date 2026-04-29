import { createServer as createHttpServer } from 'node:http';

import { sendJson } from '../../shared/http.js';

import type { ServerDependencies } from './contracts.js';
import { resolveServerDependencies } from './dependencies.js';
import { routeRequest } from './requestRouter.js';
import { runServerStartupRecoveryPasses } from './startupRecovery.js';
import { startTransportFanout } from '../../platform/transports/fanout/subscriber.js';
import {
  createSchedulerService,
  startSchedulerLoop,
} from '../../platform/scheduler/index.js';
import {
  launchScheduledRunThroughSupervision,
} from '../../platform/supervision/scheduledRunExecution.js';

export type { ServerDependencies } from './contracts.js';

function reportUnhandledServerError(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-platform-server] unhandled_route_error: ${message}\n`);
}

export function createServer(dependencies: ServerDependencies) {
  const resolvedDependencies = resolveServerDependencies(dependencies);
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

  const server = createHttpServer((request, response) => {
    void routeRequest(request, response, resolvedDependencies).catch((error) => {
      reportUnhandledServerError(error);
      sendJson(response, 500, {
        error: {
          code: 'internal_error',
          message: error instanceof Error ? error.message : 'Unexpected server error',
        },
      });
    });
  });

  server.on('close', () => {
    stopSchedulerLoop();
    stopTransportFanout();
    resolvedDependencies.chat.pollingSupervisor.stopAll();
  });

  void runServerStartupRecoveryPasses(resolvedDependencies);

  return server;
}
