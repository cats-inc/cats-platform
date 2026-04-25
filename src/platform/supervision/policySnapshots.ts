import type { CoreStore } from '../../core/store.js';
import type { CatsCoreState, CoreTraceRecord } from '../../core/types.js';
import { appendCoreTrace } from '../../core/model/index.js';
import type {
  SupervisionPolicySnapshot,
  SupervisionPolicySnapshotRef,
} from './contracts.js';

export interface SupervisionPolicySnapshotPersistenceInput {
  coreStore: CoreStore;
  snapshot: SupervisionPolicySnapshot;
  conversationId?: string | null;
  taskId?: string | null;
  traceId?: string | null;
  now?: () => Date;
}

export interface SupervisionPolicySnapshotPersistenceResult {
  snapshotRef: SupervisionPolicySnapshotRef;
  trace: CoreTraceRecord;
  core: CatsCoreState;
}

export function createSupervisionPolicySnapshotRef(
  snapshot: SupervisionPolicySnapshot,
): SupervisionPolicySnapshotRef {
  return {
    snapshotId: `policy-snapshot:${snapshot.runId}:${snapshot.actionId}`,
    policyBundleVersion: snapshot.policyBundleVersion,
    actionId: snapshot.actionId,
    runId: snapshot.runId,
  };
}

export async function persistSupervisionPolicySnapshot(
  input: SupervisionPolicySnapshotPersistenceInput,
): Promise<SupervisionPolicySnapshotPersistenceResult> {
  const snapshotRef = createSupervisionPolicySnapshotRef(input.snapshot);
  const now = input.now?.() ?? new Date();
  const next = appendCoreTrace(
    await input.coreStore.readCore(),
    {
      id: snapshotRef.snapshotId,
      traceId: input.traceId ?? `supervision-policy:${input.snapshot.runId}`,
      kind: 'status',
      conversationId: input.conversationId,
      runId: input.snapshot.runId,
      taskId: input.taskId,
      actorId: input.snapshot.actorRef,
      message: `Supervision policy snapshot for ${input.snapshot.actionId}`,
      createdAt: input.snapshot.evaluatedAt,
      metadata: {
        source: 'supervision_policy_snapshot',
        snapshotRef,
        snapshot: input.snapshot,
      },
    },
    now,
  );
  const core = await input.coreStore.writeCore(next.core);
  const trace = core.traces.find((candidate) => candidate.id === next.trace.id) ?? next.trace;

  return {
    snapshotRef,
    trace,
    core,
  };
}
