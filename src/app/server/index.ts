import { createServer as createHttpServer } from 'node:http';

import { sendJson } from '../../shared/http.js';

import type { ServerDependencies } from './contracts.js';
import { resolveServerDependencies } from './dependencies.js';
import { reconcileOrchestratorRecoveryOnStartup } from './orchestratorRecovery.js';
import { reconcilePollingOnStartup } from './polling.js';
import { routeRequest } from './requestRouter.js';

export type { ServerDependencies } from './contracts.js';

export function createServer(dependencies: ServerDependencies) {
  const resolvedDependencies = resolveServerDependencies(dependencies);

  const server = createHttpServer((request, response) => {
    void routeRequest(request, response, resolvedDependencies).catch((error) => {
      sendJson(response, 500, {
        error: {
          code: 'internal_error',
          message: error instanceof Error ? error.message : 'Unexpected server error',
        },
      });
    });
  });

  server.on('close', () => {
    resolvedDependencies.chat.pollingSupervisor.stopAll();
  });

  void reconcilePollingOnStartup(resolvedDependencies).catch(() => {});
  void reconcileOrchestratorRecoveryOnStartup(resolvedDependencies).catch(() => {});

  return server;
}
