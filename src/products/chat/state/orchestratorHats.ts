import type { ExecutionTargetSummary } from '../../../core/types.js';
import type {
  GlobalOrchestratorRouterConfig,
  GlobalOrchestratorSummary,
  GlobalOrchestratorVisibleParticipant,
} from '../api/contracts.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';

export const GLOBAL_ORCHESTRATOR_PARTICIPANT_ID = 'orchestrator' as const;
export const GLOBAL_ORCHESTRATOR_DISPLAY_NAME = 'Orchestrator' as const;

export function createGlobalOrchestratorRouterConfig(
  mentionAliases: string[] = [GLOBAL_ORCHESTRATOR_DISPLAY_NAME],
): GlobalOrchestratorRouterConfig {
  return {
    kind: 'chat_deterministic_router',
    participantKind: 'orchestrator',
    participantId: GLOBAL_ORCHESTRATOR_PARTICIPANT_ID,
    defaultDispatch: 'room_default',
    mentionAliases: normalizeMentionAliases(mentionAliases),
    audiencePolicy: 'chat_capabilities',
  };
}

export function createGlobalOrchestratorVisibleParticipant(input: {
  displayName?: string | null;
  executionTarget: ExecutionTargetSummary;
  executionModelSelection?: ProviderModelSelection | null;
}): GlobalOrchestratorVisibleParticipant {
  return {
    kind: 'visible_orchestrator_participant',
    participantKind: 'orchestrator',
    participantId: GLOBAL_ORCHESTRATOR_PARTICIPANT_ID,
    displayName: input.displayName?.trim() || GLOBAL_ORCHESTRATOR_DISPLAY_NAME,
    executionTarget: structuredClone(input.executionTarget),
    executionModelSelection: structuredClone(input.executionModelSelection ?? null),
  };
}

export function resolveGlobalOrchestratorVisibleParticipant(
  orchestrator: GlobalOrchestratorSummary,
): GlobalOrchestratorVisibleParticipant {
  return orchestrator.visibleParticipant
    ? {
        ...structuredClone(orchestrator.visibleParticipant),
        executionModelSelection:
          structuredClone(orchestrator.visibleParticipant.executionModelSelection ?? null),
      }
    : createGlobalOrchestratorVisibleParticipant({
        executionTarget: orchestrator.executionTarget,
        executionModelSelection: orchestrator.executionModelSelection ?? null,
      });
}

export function resolveGlobalOrchestratorRouterConfig(
  orchestrator: GlobalOrchestratorSummary,
): GlobalOrchestratorRouterConfig {
  return orchestrator.routerConfig
    ? {
        ...structuredClone(orchestrator.routerConfig),
        mentionAliases: normalizeMentionAliases(orchestrator.routerConfig.mentionAliases),
      }
    : createGlobalOrchestratorRouterConfig();
}

function normalizeMentionAliases(aliases: string[]): string[] {
  const normalized = aliases
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [GLOBAL_ORCHESTRATOR_DISPLAY_NAME];
}
