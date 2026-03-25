import type { AppConfig } from '../../config.js';
import type { CoreStore } from '../../core/store.js';
import type { TaskExecutionLocator } from '../../core/taskExecutionLocator.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorDispatchResponse,
  OrchestratorPlannerSurface,
} from '../../platform/orchestration/contracts.js';
import type { PendingOrchestratorDispatchRequest } from '../../platform/orchestration/pendingDispatch.js';
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

import type { AppStartupState } from './startup.js';

export type ResumePendingOrchestratorDispatch = (
  request: PendingOrchestratorDispatchRequest,
  options: {
    trigger: 'approve' | 'reroute';
  },
) => Promise<OrchestratorDispatchResponse>;

export interface ServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  chatStore: ChatStore;
  coreStore?: CoreStore;
  startup?: AppStartupState;
  companionStore?: CompanionBoxStore;
  orchestratorChannelRouter?: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface?: OrchestratorPlannerSurface<ChatState>;
  taskExecutionLocator?: TaskExecutionLocator;
  memoryStore?: CanonicalMemoryStore;
  memoryService?: CatsMemoryService;
  telegramRelay?: TelegramRelay;
  telegramRoomBridge?: TelegramRoomBridge<ChatState>;
  pollingSupervisor?: TelegramPollingSupervisor;
  now?: () => Date;
  resumePendingOrchestratorDispatch?: ResumePendingOrchestratorDispatch;
}

export type ResolvedServerDependencies = ServerDependencies & {
  coreStore: CoreStore;
  startup: AppStartupState;
  companionStore: CompanionBoxStore;
  orchestratorChannelRouter: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface: OrchestratorPlannerSurface<ChatState>;
  taskExecutionLocator: TaskExecutionLocator;
  memoryStore: CanonicalMemoryStore;
  memoryService: CatsMemoryService;
  telegramRelay: TelegramRelay;
  telegramRoomBridge: TelegramRoomBridge<ChatState>;
  pollingSupervisor: TelegramPollingSupervisor;
  resumePendingOrchestratorDispatch: ResumePendingOrchestratorDispatch;
};
