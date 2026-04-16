import type { ConcurrentChatPresentationMode } from '../../../api/workspaceContracts.js';

import { resolveConcurrentPresentationMode } from './concurrentModeResolver.js';

export interface ConcurrentClusterContext {
  turnId: string;
  sourceMessageId: string;
  segmentCount: number;
  clusterKind: 'live' | 'durable';
}

export interface ConcurrentClusterAction {
  key: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ConcurrentClusterActionContext extends ConcurrentClusterContext {
  resolvedMode: ConcurrentChatPresentationMode;
}

export interface ConcurrentClusterUiState {
  presentationOverride: 'inline_stack' | null;
}

export type ConcurrentClusterUiStateMap = Record<string, ConcurrentClusterUiState>;

export function buildConcurrentClusterUiStateKey(
  channelId: string,
  turnId: string,
): string {
  return `${channelId}:${turnId}`;
}

export function dismissConcurrentClusterUiState(
  previous: ConcurrentClusterUiStateMap,
  input: {
    channelId: string;
    turnId: string;
  },
): ConcurrentClusterUiStateMap {
  const key = buildConcurrentClusterUiStateKey(input.channelId, input.turnId);
  const nextState: ConcurrentClusterUiState = {
    presentationOverride: 'inline_stack',
  };
  const currentState = previous[key];
  if (currentState?.presentationOverride === nextState.presentationOverride) {
    return previous;
  }
  return {
    ...previous,
    [key]: nextState,
  };
}

export function resolveConcurrentClusterPresentationMode(input: {
  channelId: string;
  turnId: string;
  userDefault: ConcurrentChatPresentationMode;
  segmentCount: number;
  viewportWidth: number;
  workflowRecommendation?: ConcurrentChatPresentationMode | null;
  uiStateByKey: ConcurrentClusterUiStateMap;
}): ConcurrentChatPresentationMode {
  const clusterUiState = input.uiStateByKey[
    buildConcurrentClusterUiStateKey(input.channelId, input.turnId)
  ] ?? null;
  return resolveConcurrentPresentationMode({
    explicitOverride: clusterUiState?.presentationOverride ?? null,
    workflowRecommendation: input.workflowRecommendation ?? null,
    userDefault: input.userDefault,
    segmentCount: input.segmentCount,
    viewportWidth: input.viewportWidth,
  });
}
