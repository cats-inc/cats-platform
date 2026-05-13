import type {
  OrchestratorChannelRouter,
  OrchestratorPlannerSurface,
} from '../../../platform/orchestration/contracts.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../../platform/memory/index.js';
import type { WorkflowContinuationReplaySnapshot } from '../../../platform/orchestration/workflowContinuationReplay.js';
import type {
  ProviderCapabilityBootstrapConfig,
  ProviderCapabilityBootstrapDiagnosticSink,
} from '../../../platform/supervision/index.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../shared/runtimeRecovery.js';
import { buildApprovalQueue } from '../../../core/model/index.js';
import type { CompanionBoxStore } from './companion-box/index.js';
import type { ChatState } from '../api/contracts.js';
import type { ExternalIssueImportFetchOptions } from '../../work/integrations/externalIssueImportFetcher.js';
import type { ChatStore } from './store.js';
import type { ChatNaturalProductIntentMode } from '../shared/naturalProductIntentMode.js';
import { buildChannelView, resolveOrchestratorDisplayName } from './model/index.js';
import { resolveMentionRoute } from './mentionRouter.js';
import { resolveRoomRoutingState } from './room-routing/index.js';
import {
  resumeWorkflowContinuationReplay,
  routeChannelMessage,
} from './runtimeActions.js';
import type { ProviderAgentDecisionRequester } from './runtime-dispatch/routing.js';
import {
  buildChatOperatorView,
  buildRunInspectorView,
  resolveChatConversationId,
} from '../shared/operator-loop/index.js';
import { resolveChatWorkToolIntentManifest } from './workToolIntentResolver.js';

export function createChatDeterministicChannelRouter(
  options: {
    runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
    chatStatePath?: string;
    runtimeDataDir?: string;
    providerAgentDecisionRequester?: ProviderAgentDecisionRequester;
    providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
    providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
    naturalProductIntentMode?: ChatNaturalProductIntentMode;
    externalIssueImport?: ExternalIssueImportFetchOptions;
  } = {},
): OrchestratorChannelRouter<CompanionBoxStore, ChatState> {
  return {
    buildChannelView,
    async routeChannelMessage(input) {
      return routeChannelMessage(
        input.state,
        input.channelId,
        {
          body: input.body,
          senderName: input.senderName,
          choiceResponse: input.choiceResponse,
        },
        input.runtimeClient,
        input.now,
        {
          transport: input.transport,
          companionStore: input.companionStore,
          memoryService: input.memoryService,
          chatStore: input.chatStore as ChatStore,
          runtimeRecovery: options.runtimeRecovery,
          chatStatePath: options.chatStatePath,
          runtimeDataDir: options.runtimeDataDir,
          providerAgentDecisionRequester: options.providerAgentDecisionRequester,
          providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
          providerCapabilityBootstrapDiagnosticSink: options.providerCapabilityBootstrapDiagnosticSink,
          naturalProductIntentMode: options.naturalProductIntentMode,
          externalIssueImport: options.externalIssueImport,
        },
      );
    },
  };
}

export const chatDeterministicChannelRouter = createChatDeterministicChannelRouter();

export const chatDeterministicPlannerSurface: OrchestratorPlannerSurface<ChatState> = {
  buildChannelView,
  resolveMentionRoute,
  resolveRoomRoutingState,
  resolveOrchestratorDisplayName,
  buildOperatorView(core, channelId) {
    return buildChatOperatorView(
      {
        core,
        approvals: buildApprovalQueue(core),
      },
      channelId,
    );
  },
  buildRunInspectorView,
  resolveConversationId: resolveChatConversationId,
  resolveToolIntentManifest: resolveChatWorkToolIntentManifest,
};

export async function resumeStoredWorkflowContinuationDispatch(input: {
  request: WorkflowContinuationReplaySnapshot;
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore' | 'writeCore' | 'updateCore'>;
  runtimeClient: RuntimeClient;
  now: Date;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStatePath?: string;
  runtimeDataDir?: string;
  onStateWritten?: (channelId: string) => void;
}) {
  return resumeWorkflowContinuationReplay(input);
}
