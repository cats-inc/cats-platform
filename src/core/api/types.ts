import type { CatsMemoryService } from '../../platform/memory/index.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import type { OrchestratorDispatchResponse } from '../../platform/orchestration/contracts.js';
import type { PendingOrchestratorDispatchRequest } from '../../platform/orchestration/pendingDispatch.js';
import type { OrchestratorDispatchReplayTrigger } from '../../platform/orchestration/dispatchReplay.js';
import type {
  WorkflowContinuationReplayResult,
  WorkflowContinuationReplaySnapshot,
} from '../../platform/orchestration/workflowContinuationReplay.js';
import type { RouteContext } from '../../shared/http.js';
import type { CoreStore } from '../store.js';
import type { TaskExecutionLocator } from '../taskExecutionLocator.js';

export interface CoreApiDependencies {
  coreStore: CoreStore;
  taskExecutionLocator?: TaskExecutionLocator;
  memoryService?: CatsMemoryService;
  runtimeClient?: Pick<RuntimeClient, 'createWakeup' | 'observeSession' | 'streamSession'>;
  now?: () => Date;
  resumePendingOrchestratorDispatch?: (
    request: PendingOrchestratorDispatchRequest,
    options: {
      trigger: OrchestratorDispatchReplayTrigger;
    },
  ) => Promise<OrchestratorDispatchResponse>;
  resumeWorkflowContinuationDispatch?: (
    request: WorkflowContinuationReplaySnapshot,
    options: {
      trigger: OrchestratorDispatchReplayTrigger;
    },
  ) => Promise<WorkflowContinuationReplayResult>;
}

export interface CoreOrchestratorAutoResumeSummary {
  trigger: OrchestratorDispatchReplayTrigger;
  status: 'dispatched' | 'blocked' | 'failed';
  blockedReason: string | null;
  sourceMessageId: string | null;
  resultCount: number;
  executionState: string | null;
  error?: string;
}

export type CoreApiRouteContext = RouteContext<CoreApiDependencies>;
