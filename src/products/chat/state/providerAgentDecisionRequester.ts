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

export interface ChatProviderAgentDecisionRequesterOptions {
  failureMode?: 'throw' | 'return_null';
  knowledgeFilePath?: string;
}

export function createChatProviderAgentDecisionRequester(
  options: ChatProviderAgentDecisionRequesterOptions = {},
): ProviderAgentDecisionRequester {
  return async (input) => {
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
      const productKnowledge = isOrchestrator
        ? await loadOrchestratorKnowledge({
            channel: buildChannelView(input.state, input.channelId),
            body: input.payload.body,
            surface: 'chat-decision',
            target: binding ?? { provider: target.provider, model: target.model ?? null },
            operations: input.observation.availableTools.map(({ manifest }) => ({
              id: manifest.name, version: manifest.manifestVersion,
            })),
            policyDigest: knowledgeDigest(JSON.stringify(input.observation.policy)),
            filePath: options.knowledgeFilePath,
          })
        : undefined;
      const result = await requestProviderAgentDecision({
        runtimeClient: input.runtimeClient,
        observation: input.observation,
        productKnowledge,
        target: {
          provider: target.provider,
          instance: binding?.instance,
          model: binding ? binding.model : target.model,
          createInput: {
            modelSelection: binding?.modelSelection ?? undefined,
            context: {
              source: 'automation',
              reason: 'chat-provider-agent-decision-session',
              metadata: {
                channelId: input.channelId,
                observationId: input.observation.observationId,
              },
            },
          },
          sendInput: {
            context: {
              source: 'automation',
              reason: 'chat-provider-agent-decision',
              metadata: {
                channelId: input.channelId,
                observationId: input.observation.observationId,
              },
            },
          },
        },
        supervision: {
          product: 'cats-chat',
          surface: 'provider-agent-decision',
          runId: input.channelId,
          actionId: `${input.observation.observationId}:decision`,
          actorRef: input.observation.actor.actorRef,
          reason: 'chat_provider_agent_decision',
        },
      });

      return result.decision;
    } catch (error) {
      if (options.failureMode === 'return_null') {
        return null;
      }
      throw error;
    }
  };
}
