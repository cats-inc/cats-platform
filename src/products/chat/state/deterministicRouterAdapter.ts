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
import { messageLacksAudience, resolveMentionRoute } from './mentionRouter.js';
import { resolveCoordinatorParticipant } from './coordinator.js';
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

/**
 * The orchestrator API speaks for the owner: a turn that names nobody goes to
 * the conversation's coordinator, the way server-internal senders name their
 * audience (SPEC-125 FR-6).
 */
function resolveCoordinatorDefaultAudience(
  state: ChatState,
  channelId: string,
  body: string,
  choiceResponse: unknown,
): string[] {
  if (!messageLacksAudience(state, channelId, { body, choiceResponse })) {
    return [];
  }
  const coordinator = resolveCoordinatorParticipant(state, channelId);
  return coordinator ? [coordinator.participantId] : [];
}

export function createChatDeterministicChannelRouter(
  options: {
    runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
    chatStatePath?: string;
    platformDir?: string;
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
      const recipientParticipantIds = resolveCoordinatorDefaultAudience(
        input.state,
        input.channelId,
        input.body,
        input.choiceResponse,
      );
      return routeChannelMessage(
        input.state,
        input.channelId,
        {
          body: input.body,
          senderName: input.senderName,
          choiceResponse: input.choiceResponse,
          ...(recipientParticipantIds.length > 0 ? { messageMetadata: { recipientParticipantIds } } : {}),
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
          platformDir: options.platformDir,
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
  resolveMentionRoute(state, channelId, body, options) {
    const route = resolveMentionRoute(state, channelId, body, options);
    const coordinator = options.allowDefaultTarget && route.targets.length === 0
      && resolveCoordinatorDefaultAudience(state, channelId, body, null).length > 0
      ? resolveCoordinatorParticipant(state, channelId)
      : null;
    if (!coordinator) {
      return route;
    }
    const target = {
      participantKind: 'cat' as const,
      participantId: coordinator.participantId,
      participantName: coordinator.name,
      laneId: null,
      sessionId: null,
    };
    return {
      ...route,
      targets: [target],
      resolution: {
        ...route.resolution,
        selectionKind: 'default_target',
        defaultTarget: {
          participantKind: 'cat',
          participantId: target.participantId,
          participantName: target.participantName,
        },
        defaultTargetReason: 'default_recipient',
        blockedReason: null,
        note: null,
      },
    };
  },
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
  platformDir?: string;
  runtimeDataDir?: string;
  onStateWritten?: (channelId: string) => void;
}) {
  return resumeWorkflowContinuationReplay(input);
}
