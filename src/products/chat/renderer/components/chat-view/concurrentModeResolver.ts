import type { ConcurrentChatPresentationMode } from '../../../api/contracts.js';

export interface ConcurrentModeResolverInput {
  explicitOverride: ConcurrentChatPresentationMode | null;
  workflowRecommendation: ConcurrentChatPresentationMode | null;
  userDefault: ConcurrentChatPresentationMode;
  segmentCount: number;
}

export function resolveConcurrentPresentationMode(
  input: ConcurrentModeResolverInput,
): ConcurrentChatPresentationMode {
  if (input.explicitOverride) {
    return input.explicitOverride;
  }
  if (input.workflowRecommendation) {
    return input.workflowRecommendation;
  }
  if (input.userDefault !== 'adaptive') {
    return input.userDefault;
  }
  return 'inline_stack';
}
