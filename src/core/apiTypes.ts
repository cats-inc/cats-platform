import type { ChatStore } from '../products/chat/state/store.js';
import type { CatsMemoryService } from '../platform/memory/index.js';
import type { RuntimeClient } from '../platform/runtime/client.js';
import type { OrchestratorDispatchResponse } from '../platform/orchestration/contracts.js';
import type { PendingOrchestratorDispatchRequest } from '../platform/orchestration/pendingDispatch.js';
import type { RouteContext } from '../shared/http.js';

export interface CoreApiDependencies {
  chatStore: Pick<ChatStore, 'read' | 'readCore' | 'writeCore'>;
  memoryService?: CatsMemoryService;
  runtimeClient?: Pick<RuntimeClient, 'createWakeup' | 'observeSession' | 'streamSession'>;
  now?: () => Date;
  resumePendingOrchestratorDispatch?: (
    request: PendingOrchestratorDispatchRequest,
    options: {
      trigger: 'approve' | 'reroute';
    },
  ) => Promise<OrchestratorDispatchResponse>;
}

export interface CoreOrchestratorAutoResumeSummary {
  trigger: 'approve' | 'reroute';
  status: 'dispatched' | 'blocked' | 'failed';
  blockedReason: string | null;
  sourceMessageId: string | null;
  resultCount: number;
  executionState: string | null;
  error?: string;
}

export type CoreApiRouteContext = RouteContext<CoreApiDependencies>;
