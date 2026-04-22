import type { AppConfig } from '../../config.js';
import type { CoreStore } from '../../core/store.js';
import type { TaskExecutionLocator } from '../../core/taskExecutionLocator.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorDispatchResponse,
  OrchestratorPlannerSurface,
} from '../../platform/orchestration/contracts.js';
import type { PendingOrchestratorDispatchRequest } from '../../platform/orchestration/pendingDispatch.js';
import type { OrchestratorDispatchReplayTrigger } from '../../platform/orchestration/dispatchReplay.js';
import type {
  WorkflowContinuationReplayResult,
  WorkflowContinuationReplaySnapshot,
} from '../../platform/orchestration/workflowContinuationReplay.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import type { TelegramPollingSupervisor } from '../../platform/transports/telegram/polling.js';
import type { TelegramRelay } from '../../platform/transports/telegram/relay/index.js';
import type { TelegramRoomBridge } from '../../platform/transports/telegram/bridge.js';
import type {
  CanonicalMemoryStore,
  CatsMemoryService,
} from '../../platform/memory/index.js';
import type { ChatState } from '../../products/chat/api/contracts.js';
import type { CompanionBoxStore } from '../../products/chat/state/companion-box/index.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import type { ChatEventHub } from '../../products/chat/api/chatEventHub.js';
import type { AsyncKeyedGate } from '../../products/chat/shared/asyncControl.js';
import type { WorkApiDependencies } from '../../products/work/api/index.js';
import type { CodeApiDependencies } from '../../products/code/api/index.js';
import type { TelegramCommandSurfaceSync } from './telegramCommandSurfaceSync.js';

import type { AppStartupState } from './startup.js';

export type ResumePendingOrchestratorDispatch = (
  request: PendingOrchestratorDispatchRequest,
  options: {
    trigger: OrchestratorDispatchReplayTrigger;
  },
) => Promise<OrchestratorDispatchResponse>;

export type ResumeWorkflowContinuationDispatch = (
  request: WorkflowContinuationReplaySnapshot,
  options: {
    trigger: OrchestratorDispatchReplayTrigger;
  },
) => Promise<WorkflowContinuationReplayResult>;

export interface SharedServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  coreStore?: CoreStore;
  startup?: AppStartupState;
  now?: () => Date;
  resumePendingOrchestratorDispatch?: ResumePendingOrchestratorDispatch;
  resumeWorkflowContinuationDispatch?: ResumeWorkflowContinuationDispatch;
}

export interface ChatServerDependencies {
  chatStore: ChatStore;
  mutationGate?: AsyncKeyedGate;
  companionStore?: CompanionBoxStore;
  orchestratorChannelRouter?: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface?: OrchestratorPlannerSurface<ChatState>;
  taskExecutionLocator?: TaskExecutionLocator;
  memoryStore?: CanonicalMemoryStore;
  memoryService?: CatsMemoryService;
  telegramRelay?: TelegramRelay;
  telegramRoomBridge?: TelegramRoomBridge<ChatState>;
  pollingSupervisor?: TelegramPollingSupervisor;
  telegramCommandSurfaceSync?: TelegramCommandSurfaceSync;
  eventHub?: ChatEventHub;
}

export interface WorkServerDependencies extends Partial<WorkApiDependencies> {}

export interface CodeServerDependencies extends Partial<CodeApiDependencies> {}

export interface ServerDependencies {
  shared: SharedServerDependencies;
  chat: ChatServerDependencies;
  work?: WorkServerDependencies;
  code?: CodeServerDependencies;
}

export interface ResolvedSharedServerDependencies extends SharedServerDependencies {
  coreStore: CoreStore;
  startup: AppStartupState;
  resumePendingOrchestratorDispatch: ResumePendingOrchestratorDispatch;
  resumeWorkflowContinuationDispatch: ResumeWorkflowContinuationDispatch;
}

export interface ResolvedChatServerDependencies extends ChatServerDependencies {
  mutationGate: AsyncKeyedGate;
  companionStore: CompanionBoxStore;
  orchestratorChannelRouter: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface: OrchestratorPlannerSurface<ChatState>;
  taskExecutionLocator: TaskExecutionLocator;
  memoryStore: CanonicalMemoryStore;
  memoryService: CatsMemoryService;
  telegramRelay: TelegramRelay;
  telegramRoomBridge: TelegramRoomBridge<ChatState>;
  pollingSupervisor: TelegramPollingSupervisor;
  telegramCommandSurfaceSync: TelegramCommandSurfaceSync;
  eventHub: ChatEventHub;
}

export interface ResolvedServerDependencies {
  shared: ResolvedSharedServerDependencies;
  chat: ResolvedChatServerDependencies;
  work: WorkApiDependencies;
  code: CodeApiDependencies;
}
