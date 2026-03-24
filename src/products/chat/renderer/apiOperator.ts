import type {
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalQueueItem,
  CoreApprovalStatus,
  CoreOperatorActionKind,
} from '../../../core/types';
import type { ChatOperatorSnapshot } from '../shared/operatorLoop';

import { expectJson, readErrorMessage } from './apiShared.js';

async function fetchCoreState(signal?: AbortSignal): Promise<CatsCoreState> {
  const response = await fetch('/api/core', {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return expectJson<CatsCoreState>(response, `cats core state returned ${response.status}`);
}

async function fetchCoreApprovals(signal?: AbortSignal): Promise<CoreApprovalQueueItem[]> {
  const response = await fetch('/api/core/approvals', {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  const payload = await expectJson<{ approvals: CoreApprovalQueueItem[] }>(
    response,
    `cats core approvals returned ${response.status}`,
  );

  return payload.approvals;
}

export async function fetchOperatorLoopSnapshot(
  signal?: AbortSignal,
): Promise<ChatOperatorSnapshot> {
  const [core, approvals] = await Promise.all([
    fetchCoreState(signal),
    fetchCoreApprovals(signal),
  ]);

  return {
    core,
    approvals,
  };
}

export interface CoreApprovalDecisionInput {
  taskId: string;
  status: Exclude<CoreApprovalStatus, 'not_requested'>;
  action?: CoreApprovalDecisionAction | null;
  decidedByActorId?: string | null;
  notes?: string | null;
}

export async function writeCoreApprovalDecision(
  input: CoreApprovalDecisionInput,
  signal?: AbortSignal,
): Promise<ChatOperatorSnapshot> {
  const response = await fetch('/api/core/approvals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `cats core approval returned ${response.status}`));
  }

  try {
    return await fetchOperatorLoopSnapshot(signal);
  } catch {
    return fetchOperatorLoopSnapshot();
  }
}

export interface CoreOperatorActionInput {
  action: CoreOperatorActionKind;
  actorId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  checkpointId?: string | null;
  outcomeId?: string | null;
  notes?: string | null;
}

export async function writeCoreOperatorAction(
  input: CoreOperatorActionInput,
  signal?: AbortSignal,
): Promise<ChatOperatorSnapshot> {
  const response = await fetch('/api/core/operator-actions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `cats core operator action returned ${response.status}`),
    );
  }

  try {
    return await fetchOperatorLoopSnapshot(signal);
  } catch {
    return fetchOperatorLoopSnapshot();
  }
}
