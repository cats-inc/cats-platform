import {
  requestProviderAgentDecision,
} from '../../../platform/orchestration/index.js';
import type {
  ProviderAgentDecisionRequester,
} from './runtime-dispatch/routing.js';

export function createChatProviderAgentDecisionRequester(): ProviderAgentDecisionRequester {
  return async (input) => {
    const target = input.observation.actor.target;
    if (target.kind !== 'execution_target') {
      return null;
    }

    const result = await requestProviderAgentDecision({
      runtimeClient: input.runtimeClient,
      observation: input.observation,
      target: {
        provider: target.provider,
        model: target.model,
        createInput: {
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
  };
}
