import {
  requestProviderAgentDecision,
} from '../../../platform/orchestration/index.js';
import type {
  ProviderAgentDecisionRequester,
} from './runtime-dispatch/routing.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import { buildChannelView, requireChannel } from './model/index.js';
import { resolveOrchestratorExecutionTarget } from './runtimeTargeting.js';
import { isOrchestratorKnowledgeChannel, loadOrchestratorKnowledge } from './orchestratorKnowledge.js';
import { resolveProviderCapabilityProfile } from '../../../platform/supervision/providerCapabilityProfiles.js';
import type { ChatState } from '../api/contracts.js';
import type { ProviderAgentBoundedObservation } from '../../../platform/orchestration/providerAgentDecision.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { isCollaborationTool, type CollaborationReadReceipt } from './orchestratorCollaboration.js';
import { runCollaborationDecisionLoop } from './orchestratorCollaborationLoop.js';
import { isCollaborationExecutionTool } from './collaborationExecutionSurface.js';
import { runCollaborationExecutionLoop } from './collaborationExecutionLoop.js';
import type { ChatStore } from './store.js';
import type { RuntimeDeliveryClient } from '../../../platform/runtime/deliveryClient.js';
import { createProviderAgentPromptSession } from '../../../platform/orchestration/providerAgentPromptSession.js';
import { resolveCollaborationPreparationBudget,
  type CollaborationPreparationBudget } from '../shared/collaborationPreparationBudget.js';

export interface ChatProviderAgentDecisionRequesterOptions {
  preparationBudget?: Partial<CollaborationPreparationBudget>;
  failureMode?: 'throw' | 'return_null';
  knowledgeFilePath?: string;
  platformDir?: string;
  readState?: () => Promise<ChatState>;
  chatStore?: ChatStore;
  deliveryClient?: RuntimeDeliveryClient;
  publishCollaboration?: (channelId: string, action: 'created' | 'updated') => void;
  runChatMutation?: <T>(channelId: string, operation: () => Promise<T>) => Promise<T>;
}

export function createChatProviderAgentDecisionRequester(
  options: ChatProviderAgentDecisionRequesterOptions = {},
): ProviderAgentDecisionRequester {
  const preparationBudget = resolveCollaborationPreparationBudget(options.preparationBudget);
  const requester: ProviderAgentDecisionRequester = async (input) => {
    const target = input.observation.actor.target;
    if (target.kind !== 'execution_target') {
      return null;
    }

    try {
      const isOrchestrator = input.observation.actor.actorRef === 'orchestrator'
        && isOrchestratorKnowledgeChannel(requireChannel(input.state, input.channelId));
      const binding = isOrchestrator
        ? resolveOrchestratorExecutionTarget(input.state, requireChannel(input.state, input.channelId))
        : null;
      // Profile identity includes normalized default models, instance and model controls.
      // No bootstrap policy is re-decided here: only its target identity is compared.
      const currentProfile = binding ? resolveProviderCapabilityProfile(binding, {
        assessedAt: input.now.toISOString(),
      }) : null;
      if (currentProfile && (currentProfile.profileId !== input.observation.actor.capabilityProfileRef
        || currentProfile.provider !== target.provider || currentProfile.model !== target.model
        || currentProfile.control !== (target.control ?? null))) {
        return null;
      }
      const hasCollaborationExecution = input.observation.availableTools
        .some(({ manifest }) => isCollaborationExecutionTool(manifest.name));
      const promptSession = isOrchestrator && (hasCollaborationExecution
        || input.observation.availableTools.some(({ manifest }) => isCollaborationTool(manifest.name)))
        ? createProviderAgentPromptSession(hasCollaborationExecution ? 8 : 4) : undefined;
      const request = async (state: ChatState, observation: ProviderAgentBoundedObservation,
        runtimeClient: RuntimeClient, sessionId: string | null = null,
        receipts?: CollaborationReadReceipt[]) => {
        const productKnowledge = isOrchestrator
          ? await loadOrchestratorKnowledge({
              channel: buildChannelView(state, input.channelId),
              body: receipts ? observation.goal : input.payload.body,
              surface: 'chat-decision',
              target: binding ?? { provider: target.provider, model: target.model ?? null },
              operations: observation.availableTools.map(({ manifest }) => ({
                id: manifest.name, version: manifest.manifestVersion,
              })),
              policyDigest: knowledgeDigest(JSON.stringify(observation.policy)),
              filePath: options.knowledgeFilePath,
              platformDir: options.platformDir,
            })
          : undefined;
        const result = await requestProviderAgentDecision({
          runtimeClient,
          observation,
          productKnowledge,
          toolResults: receipts,
          promptSession,
          target: {
            sessionId,
            provider: target.provider,
            instance: binding?.instance,
            model: binding ? binding.model : target.model,
            createInput: {
              ...(receipts ? {
                workspaceKind: 'sandbox' as const, workspaceAccess: 'read_only' as const,
                permissionMode: 'default' as const, sharingMode: 'isolated' as const,
                skills: { requestedSkills: [], strict: true },
              } : {}),
              modelSelection: binding?.modelSelection ?? undefined,
              context: {
                source: 'automation',
                reason: 'chat-provider-agent-decision-session',
                metadata: {
                  channelId: input.channelId,
                  observationId: observation.observationId,
                },
              },
            },
            sendInput: {
              context: {
                source: 'automation',
                reason: 'chat-provider-agent-decision',
                metadata: {
                  channelId: input.channelId,
                  observationId: observation.observationId,
                },
              },
            },
          },
          supervision: {
            product: 'cats-chat',
            surface: 'provider-agent-decision',
            runId: input.channelId,
            actionId: `${observation.observationId}:decision`,
            actorRef: input.observation.actor.actorRef,
            reason: 'chat_provider_agent_decision',
          },
        });
        if (receipts && result.runtimeMessage.segments.some((segment) => segment.kind !== 'text')) {
          throw new Error('Native tool activity is not part of collaboration preparation.');
        }
        return result;
      };

      if (isOrchestrator && input.onCollaborationResult && options.chatStore && options.deliveryClient
        && input.observation.availableTools.some(({ manifest }) => isCollaborationExecutionTool(manifest.name))) {
        return runCollaborationExecutionLoop({ chatStore: options.chatStore, deliveryClient: options.deliveryClient,
          runtimeClient: input.runtimeClient, channelId: input.channelId,
          choiceResponse: input.payload.choiceResponse, observation: input.observation,
          isCancelled: input.isCancelled, report: input.onCollaborationResult, request,
          publish: options.publishCollaboration, runChatMutation: options.runChatMutation });
      }
      if (isOrchestrator && input.onCollaborationResult
        && input.observation.availableTools.some(({ manifest }) => isCollaborationTool(manifest.name))) {
        return runCollaborationDecisionLoop({
          preparationBudget,
          state: input.state, channelId: input.channelId, goal: input.payload.body,
          observation: input.observation, runtimeClient: input.runtimeClient,
          readState: options.readState, isCancelled: input.isCancelled,
          report: input.onCollaborationResult, request,
        });
      }

      const result = await request(input.state, input.observation, input.runtimeClient);
      return result.decision;
    } catch (error) {
      if (options.failureMode === 'return_null') {
        return null;
      }
      throw error;
    }
  };
  requester.supportsCollaboration = true;
  requester.supportsCollaborationExecution = Boolean(options.chatStore?.updateSnapshot && options.deliveryClient);
  Object.defineProperty(requester, 'preparationBudget', { value: preparationBudget, enumerable: true });
  return requester;
}
