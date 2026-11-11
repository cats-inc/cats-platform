import {
  requestProviderAgentDecision,
} from '../../../platform/orchestration/index.js';
import type {
  ProviderAgentDecisionRequester,
} from './runtime-dispatch/routing.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import { buildChannelView, requireChannel, resolveChannelCanonicalIdentity } from './model/index.js';
import { isCoordinatorActorRef, resolveCoordinatorParticipant } from './coordinator.js';
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
import { isBossCatTool, runBossCatDecisionLoop, type BossCatBoardSources } from './bossCatSurface.js';
import { updateChatState } from './store.js';
import { createDurableToolEvidenceSink } from '../../../platform/supervision/evidenceSink.js';
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
  /** Own-initiative profiles for the Boss Cat board (SPEC-137, SPEC-139 FR-3). */
  readLifeProfiles?: BossCatBoardSources['readLifeProfiles'];
  /** Where SPEC-139 FR-16 supervision records go (ids only), per conversation. */
  evidenceDataDir?: string;
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
      if (input.bossCat) {
        return await runBossCatDecision(input, input.bossCat, options);
      }
      // The coordinator decides with product knowledge, bound to its own model.
      const coordinator = isCoordinatorActorRef(input.state, input.channelId, input.observation.actor.actorRef)
        && isOrchestratorKnowledgeChannel(requireChannel(input.state, input.channelId))
        ? resolveCoordinatorParticipant(input.state, input.channelId)
        : null;
      const isOrchestrator = coordinator !== null;
      const binding = coordinator
        ? {
            provider: coordinator.execution.target.provider,
            instance: coordinator.execution.target.instance ?? null,
            model: coordinator.execution.target.model ?? null,
            modelSelection: coordinator.execution.modelSelection ?? null,
          }
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
          // One-shot decisions own their session; collaboration loops reuse theirs.
          closeCreatedSession: !promptSession && !receipts,
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
  requester.supportsBossCat = Boolean(options.chatStore?.updateSnapshot);
  Object.defineProperty(requester, 'preparationBudget', { value: preparationBudget, enumerable: true });
  return requester;
}

/**
 * SPEC-139 FR-1: the Boss Cat decides in an isolated session. Its input is the owner's current
 * message and the boards it reads: no product knowledge, lane transcript, heartbeat, review,
 * file or tool output. The session is a read-only sandbox with no skills, on the Boss Cat's own
 * model, and it is closed when the loop ends.
 */
async function runBossCatDecision(
  input: Parameters<ProviderAgentDecisionRequester>[0],
  bossCat: NonNullable<Parameters<ProviderAgentDecisionRequester>[0]['bossCat']>,
  options: ChatProviderAgentDecisionRequesterOptions,
): Promise<null> {
  const chatStore = options.chatStore;
  const target = input.observation.actor.target;
  if (!chatStore?.updateSnapshot || target.kind !== 'execution_target'
    || !input.observation.availableTools.every(({ manifest }) => isBossCatTool(manifest.name))) {
    return null;
  }
  const participant = resolveCoordinatorParticipant(input.state, input.channelId);
  const execution = participant?.execution ?? null;
  const promptSession = createProviderAgentPromptSession(4);
  const record = await runBossCatDecisionLoop({
    channelId: input.channelId,
    sourceMessageId: bossCat.sourceMessageId,
    bossCatId: bossCat.bossCatId,
    observation: input.observation,
    runtimeClient: input.runtimeClient,
    isCancelled: input.isCancelled,
    readState: () => chatStore.read(),
    updateState: (mutate) => updateChatState(chatStore, mutate),
    readCore: () => chatStore.readCore(),
    readLifeProfiles: options.readLifeProfiles,
    evidenceSink: options.evidenceDataDir
      ? createDurableToolEvidenceSink({
          dataDir: options.evidenceDataDir,
          conversationId: resolveChannelCanonicalIdentity(input.state, input.channelId).conversationId,
        })
      : undefined,
    request: async (observation, runtime, sessionId, feedback) => requestProviderAgentDecision({
      runtimeClient: runtime,
      observation,
      toolResults: feedback.length > 0 ? feedback : undefined,
      promptSession,
      closeCreatedSession: false,
      target: {
        sessionId,
        provider: target.provider,
        instance: execution?.target.instance ?? undefined,
        model: execution?.target.model ?? target.model,
        createInput: {
          workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default',
          sharingMode: 'isolated', skills: { requestedSkills: [], strict: true },
          modelSelection: execution?.modelSelection ?? undefined,
          context: {
            source: 'automation',
            reason: 'chat-boss-cat-decision-session',
            metadata: { channelId: input.channelId, observationId: observation.observationId },
          },
        },
        sendInput: {
          context: {
            source: 'automation',
            reason: 'chat-boss-cat-decision',
            metadata: { channelId: input.channelId, observationId: observation.observationId },
          },
        },
      },
      supervision: {
        product: 'cats-chat',
        surface: 'boss-cat-decision',
        runId: input.channelId,
        actionId: `${observation.observationId}:decision`,
        actorRef: input.observation.actor.actorRef,
        reason: 'chat_boss_cat_decision',
      },
    }),
  });
  if (record) input.onBossCatResult?.(record);
  return null;
}
