import type { ConcurrentChatPresentationMode } from '../../../api/workspaceContracts.js';

import { resolveConcurrentPresentationMode } from './concurrentModeResolver.js';

export const CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY = 'cats.concurrent-cluster-ui-state';

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

interface ConcurrentClusterUiStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readConcurrentClusterUiStateRecord(
  value: unknown,
): ConcurrentClusterUiState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const presentationOverride = (value as { presentationOverride?: unknown }).presentationOverride;
  if (presentationOverride !== 'inline_stack') {
    return null;
  }
  return { presentationOverride };
}

export function buildConcurrentClusterUiStateKey(
  channelId: string,
  turnId: string,
): string {
  return `${channelId}:${turnId}`;
}

export function parseStoredConcurrentClusterUiStateMap(
  value: string | null | undefined,
): ConcurrentClusterUiStateMap {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const next: ConcurrentClusterUiStateMap = {};
    for (const [key, record] of Object.entries(parsed)) {
      if (!key || typeof key !== 'string') {
        continue;
      }
      const normalized = readConcurrentClusterUiStateRecord(record);
      if (normalized) {
        next[key] = normalized;
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function readConcurrentClusterUiStateMap(
  storage: ConcurrentClusterUiStateStorage | null | undefined,
): ConcurrentClusterUiStateMap {
  if (!storage) {
    return {};
  }

  try {
    return parseStoredConcurrentClusterUiStateMap(
      storage.getItem(CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY),
    );
  } catch {
    return {};
  }
}

export function writeConcurrentClusterUiStateMap(
  storage: ConcurrentClusterUiStateStorage | null | undefined,
  value: ConcurrentClusterUiStateMap,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    // Ignore storage failures and keep the in-memory dismiss path working.
  }
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
