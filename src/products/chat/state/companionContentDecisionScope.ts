import type { ProviderAgentBoundedObservation } from '../../../platform/orchestration/index.js';
import type { ProviderAgentDecisionRequester } from './runtime-dispatch/routing.js';
import {
  COMPANION_CONTENT_TOOL_PREFIX,
  isCompanionContentTool,
} from '../companion/supervisedContentTools.js';

/**
 * Narrows an observation to companion content tools. Returns null when none are
 * offered, so a companion-only requester never spends a decision call on turns
 * that have nothing for it to decide.
 */
export function restrictObservationToCompanionContentTools(
  observation: ProviderAgentBoundedObservation,
): ProviderAgentBoundedObservation | null {
  const availableTools = observation.availableTools
    .filter(({ manifest }) => isCompanionContentTool(manifest.name));
  if (availableTools.length === 0) {
    return null;
  }

  return {
    ...observation,
    availableTools,
    invariants: observation.invariants
      .filter((invariant) => invariant.includes(COMPANION_CONTENT_TOOL_PREFIX)),
  };
}

/**
 * Used while `CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED` is off: decisions run only
 * for companion content tools. It deliberately carries no preparation budget or
 * collaboration support, so every other reader treats it like an absent requester.
 */
export function createCompanionContentDecisionRequester(
  base: ProviderAgentDecisionRequester,
): ProviderAgentDecisionRequester {
  return async (input) => {
    const observation = restrictObservationToCompanionContentTools(input.observation);
    return observation ? base({ ...input, observation }) : null;
  };
}
