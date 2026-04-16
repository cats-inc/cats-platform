import type { ConcurrentChatPresentationMode } from '../../../api/workspaceContracts.js';

const COMPARE_MIN_WIDTH = 720;
const COMPARE_MIN_SEGMENTS = 2;
const COMPARE_MAX_SEGMENTS = 4;

export interface ConcurrentModeResolverInput {
  explicitOverride: ConcurrentChatPresentationMode | null;
  workflowRecommendation: ConcurrentChatPresentationMode | null;
  userDefault: ConcurrentChatPresentationMode;
  segmentCount: number;
  viewportWidth: number;
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
  if (
    input.viewportWidth >= COMPARE_MIN_WIDTH
    && input.segmentCount >= COMPARE_MIN_SEGMENTS
    && input.segmentCount <= COMPARE_MAX_SEGMENTS
  ) {
    return 'compare_cards';
  }
  return 'inline_stack';
}
