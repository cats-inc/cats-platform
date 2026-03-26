import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState, upsertCoreTask } from '../dist-server/core/model/index.js';
import { MemoryCoreStore } from '../dist-server/core/store.js';
import { reconcileOrchestratorRecoveryOnStartup } from '../dist-server/app/server/orchestratorRecovery.js';
import {
  buildPendingOrchestratorDispatchRequest,
  readPendingOrchestratorDispatchSnapshot,
  writePendingOrchestratorDispatchMetadata,
} from '../dist-server/platform/orchestration/pendingDispatch.js';
import {
  buildOrchestratorDispatchReplayRequest,
  readOrchestratorDispatchReplay,
  writeOrchestratorDispatchReplayMetadata,
} from '../dist-server/platform/orchestration/dispatchReplay.js';
import {
  buildWorkflowContinuationReplayRequest,
  readWorkflowContinuationReplay,
  writeWorkflowContinuationReplayMetadata,
} from '../dist-server/platform/orchestration/workflowContinuationReplay.js';

test('startup recovery turns stranded orchestrator replay metadata into retryable failed state', async () => {
  const now = new Date('2026-03-26T06:00:00.000Z');
  const taskWrite = upsertCoreTask(
    createDefaultCoreState(),
    {
      id: 'task-recovery-startup',
      title: 'Recover startup replay metadata',
      status: 'blocked',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-worker'],
      metadata: writeOrchestratorDispatchReplayMetadata(
        writePendingOrchestratorDispatchMetadata(
          {},
          buildPendingOrchestratorDispatchRequest({
            channelId: 'channel-recovery',
            body: 'Please continue the blocked workflow.',
            blockedAt: '2026-03-26T05:55:00.000Z',
          }),
          {
            replayState: 'in_progress',
            replayTrigger: 'approve',
            replayAttemptAt: '2026-03-26T05:56:00.000Z',
          },
        ),
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-recovery',
          body: 'Please continue the blocked workflow.',
          recordedAt: '2026-03-26T05:55:00.000Z',
        }),
        {
          replayState: 'in_progress',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T05:57:00.000Z',
        },
      ),
    },
    now,
  );
  const coreStore = new MemoryCoreStore(taskWrite.core);

  const recoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore,
      now: () => new Date('2026-03-26T06:01:00.000Z'),
    },
  });

  assert.equal(recoveredCount, 1);

  const core = await coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === 'task-recovery-startup');
  const pendingDispatch = readPendingOrchestratorDispatchSnapshot(task?.metadata, {
    includeInProgress: true,
  });
  const replay = readOrchestratorDispatchReplay(task?.metadata, {
    includeInProgress: true,
  });
  const recoveryNote = core.activities.find((candidate) =>
    candidate.taskId === 'task-recovery-startup'
    && candidate.metadata?.source === 'orchestrator-startup-recovery');

  assert.equal(pendingDispatch?.replayState, 'failed');
  assert.equal(
    pendingDispatch?.replayError,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
  assert.equal(replay?.replayState, 'failed');
  assert.equal(
    replay?.replayError,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
  assert.ok(recoveryNote);
  assert.equal(recoveryNote?.kind, 'note');
  assert.equal(recoveryNote?.metadata?.replayPhase, 'startup_recovered');
  assert.equal(
    recoveryNote?.metadata?.error,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
});

test('startup recovery turns stranded workflow-continuation replay metadata into retryable failed state', async () => {
  const now = new Date('2026-03-26T06:10:00.000Z');
  const taskWrite = upsertCoreTask(
    createDefaultCoreState(),
    {
      id: 'task-recovery-workflow-continuation',
      title: 'Recover workflow continuation replay metadata',
      status: 'blocked',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-worker'],
      metadata: writeWorkflowContinuationReplayMetadata(
        {},
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-recovery',
          checkpointId: 'checkpoint-recovery',
          sourceMessageId: 'message-followup',
          sourceParticipant: {
            participantKind: 'cat',
            participantId: 'cat-inline',
            participantName: 'Inline-Agent',
          },
          targets: [
            {
              participantKind: 'cat',
              participantId: 'cat-followup',
              participantName: 'Followup-Agent',
            },
          ],
          branchStrategy: 'transplant_context',
          workflowStageId: 'continuation_handoff',
          workflowShape: 'sequential',
          recordedAt: '2026-03-26T06:09:00.000Z',
        }),
        {
          replayState: 'in_progress',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T06:09:30.000Z',
        },
      ),
    },
    now,
  );
  const coreStore = new MemoryCoreStore(taskWrite.core);

  const recoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore,
      now: () => new Date('2026-03-26T06:11:00.000Z'),
    },
  });

  assert.equal(recoveredCount, 1);

  const core = await coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === 'task-recovery-workflow-continuation');
  const replay = readWorkflowContinuationReplay(task?.metadata, {
    includeInProgress: true,
  });
  const recoveryNote = core.activities.find((candidate) =>
    candidate.taskId === 'task-recovery-workflow-continuation'
    && candidate.metadata?.source === 'workflow-continuation-replay');

  assert.equal(replay?.replayState, 'failed');
  assert.equal(
    replay?.replayError,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
  assert.ok(recoveryNote);
  assert.equal(recoveryNote?.kind, 'note');
  assert.equal(recoveryNote?.metadata?.replayPhase, 'startup_recovered');
});
