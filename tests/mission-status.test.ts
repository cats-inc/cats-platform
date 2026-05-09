import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_ACTIVE_STATUSES,
  MISSION_PRE_LAUNCH_STATUSES,
  MISSION_TERMINAL_STATUSES,
  RUN_ACTIVE_STATUSES,
  RUN_TERMINAL_STATUSES,
  isActiveMission,
  isActiveRun,
  isBlockedRun,
  isPreLaunchMission,
  isTerminalMission,
  isTerminalRun,
} from '../src/core/missionStatus.js';
import type {
  CoreRunRecord,
  CoreRunStatus,
  MissionRecord,
  MissionRecordStatus,
} from '../src/core/types.js';

function makeMission(status: MissionRecordStatus): MissionRecord {
  return {
    id: 'mission-1',
    managedWorkId: null,
    conversationId: null,
    sourceTurnId: null,
    sourceLaneId: null,
    assignedAgentId: null,
    title: 'Test mission',
    status,
    summary: null,
    createdAt: '2026-04-14T22:00:00.000Z',
    updatedAt: '2026-04-14T22:00:00.000Z',
    metadata: {},
  };
}

function makeRun(status: CoreRunStatus): CoreRunRecord {
  return {
    id: 'run-1',
    title: 'Test run',
    status,
    conversationId: null,
    taskId: null,
    parentRunId: null,
    orchestratorActorId: null,
    traceId: null,
    summary: null,
    createdAt: '2026-04-14T22:00:00.000Z',
    startedAt: null,
    completedAt: null,
    updatedAt: '2026-04-14T22:00:00.000Z',
    metadata: {},
  };
}

test('mission status sets cover the canonical taxonomy without overlap', () => {
  const allMissionStatuses: MissionRecordStatus[] = [
    'draft',
    'planned',
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled',
  ];
  for (const status of allMissionStatuses) {
    const inActive = MISSION_ACTIVE_STATUSES.has(status);
    const inTerminal = MISSION_TERMINAL_STATUSES.has(status);
    assert.equal(
      inActive && inTerminal,
      false,
      `${status} should not be both active and terminal`,
    );
  }
  // pre-launch overlaps active for `planned` only — by design.
  assert.equal(MISSION_PRE_LAUNCH_STATUSES.has('draft'), true);
  assert.equal(MISSION_PRE_LAUNCH_STATUSES.has('planned'), true);
  assert.equal(MISSION_PRE_LAUNCH_STATUSES.has('running'), false);
});

test('isActiveMission / isTerminalMission / isPreLaunchMission classify each status', () => {
  assert.equal(isPreLaunchMission(makeMission('draft')), true);
  assert.equal(isActiveMission(makeMission('draft')), false);
  assert.equal(isActiveMission(makeMission('planned')), true);
  assert.equal(isPreLaunchMission(makeMission('planned')), true);
  assert.equal(isActiveMission(makeMission('queued')), true);
  assert.equal(isActiveMission(makeMission('running')), true);
  assert.equal(isTerminalMission(makeMission('completed')), true);
  assert.equal(isTerminalMission(makeMission('failed')), true);
  assert.equal(isTerminalMission(makeMission('cancelled')), true);
  assert.equal(isActiveMission(makeMission('completed')), false);
});

test('run status sets cover the canonical taxonomy and treat blocked separately', () => {
  const allRunStatuses: CoreRunStatus[] = [
    'queued',
    'running',
    'blocked',
    'completed',
    'failed',
    'cancelled',
  ];
  for (const status of allRunStatuses) {
    const inActive = RUN_ACTIVE_STATUSES.has(status);
    const inTerminal = RUN_TERMINAL_STATUSES.has(status);
    assert.equal(
      inActive && inTerminal,
      false,
      `${status} should not be both active and terminal`,
    );
  }
  assert.equal(RUN_ACTIVE_STATUSES.has('blocked'), false);
  assert.equal(RUN_TERMINAL_STATUSES.has('blocked'), false);
});

test('isActiveRun / isTerminalRun / isBlockedRun classify each status', () => {
  assert.equal(isActiveRun(makeRun('queued')), true);
  assert.equal(isActiveRun(makeRun('running')), true);
  assert.equal(isActiveRun(makeRun('blocked')), false);
  assert.equal(isBlockedRun(makeRun('blocked')), true);
  assert.equal(isTerminalRun(makeRun('completed')), true);
  assert.equal(isTerminalRun(makeRun('failed')), true);
  assert.equal(isTerminalRun(makeRun('cancelled')), true);
  assert.equal(isActiveRun(makeRun('completed')), false);
});
