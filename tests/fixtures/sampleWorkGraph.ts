import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreTask,
  upsertCoreWorkGraphLink,
  upsertCoreWorkItem,
} from '../../src/core/model/index.ts';
import { buildWorkGraphProjection } from '../../src/products/work/api/workGraphProjection.ts';
import type { WorkGraphProjection } from '../../src/products/work/shared/workGraphTypes.ts';

const NOW = new Date('2026-04-25T03:55:00Z');

/**
 * Test fixture mirroring the demo content the old MOCK_WORK_GRAPH used
 * to seed: 3 projects, 4 work items (one orphan), 4 tasks, plus the
 * SPEC-090 link rows that exercised every stored kind, an orphan, and
 * a 2-cycle.
 *
 * Built by running buildWorkGraphProjection over a hand-rolled Core
 * state so tests verify the server projection contract end-to-end.
 */
export const SAMPLE_WORK_GRAPH: WorkGraphProjection = (() => {
  let core = createDefaultCoreState();

  // Tasks first (work items reference them via taskId)
  for (const taskInput of [
    {
      id: 'task-hero-copy',
      title: 'Hero copy v3',
      status: 'pending_approval' as const,
      summary: 'Draft 3 of the hero copy is ready for review.',
    },
    {
      id: 'task-deploy',
      title: 'Deploy landing page to staging',
      status: 'blocked' as const,
      summary: 'Failed last attempt; pending owner decision on rollback.',
    },
    {
      id: 'task-read-transcripts',
      title: 'Read transcripts to find bottleneck',
      status: 'blocked' as const,
      summary: 'Awaiting metrics refresh.',
    },
    {
      id: 'task-write-spec',
      title: 'Write RD role spec',
      status: 'completed' as const,
      summary: 'Spec written, owner approved.',
    },
  ]) {
    core = upsertCoreTask(core, taskInput, NOW).core;
  }

  // Projects
  for (const projectInput of [
    {
      id: 'proj-bf',
      title: 'Black Friday landing page',
      status: 'active' as const,
      ownerActorId: 'actor-owner',
      summary: 'Refresh the landing page in time for the BF promo.',
    },
    {
      id: 'proj-cs',
      title: 'CS queue investigation',
      status: 'active' as const,
      ownerActorId: 'actor-owner',
      summary: 'Why is the CS response time creeping up?',
    },
    {
      id: 'proj-rd-hire',
      title: 'RD hire (Q2)',
      status: 'planned' as const,
      ownerActorId: 'actor-owner',
      summary: 'Define and post a role spec for a senior RD agent.',
    },
  ]) {
    core = upsertCoreProject(core, projectInput, NOW).core;
  }

  // Work items
  for (const wiInput of [
    {
      id: 'wi-landing',
      title: 'Landing page rev 3',
      status: 'in_progress' as const,
      ownerActorId: 'actor-owner',
      projectId: 'proj-bf',
      summary: 'Hero copy + design + deploy.',
    },
    {
      id: 'wi-bottleneck',
      title: 'Identify CS response-time bottleneck',
      status: 'blocked' as const,
      ownerActorId: 'actor-owner',
      projectId: 'proj-cs',
      taskId: 'task-read-transcripts',
      summary: 'Find the slow handoff between humans and agents.',
    },
    {
      id: 'wi-role-spec',
      title: 'Define RD role spec',
      status: 'completed' as const,
      ownerActorId: 'actor-owner',
      projectId: 'proj-rd-hire',
      taskId: 'task-write-spec',
      summary: 'Role spec doc written and approved.',
    },
    {
      id: 'wi-orphan',
      title: '[orphan] Forgotten retention email idea',
      status: 'draft' as const,
      ownerActorId: 'actor-owner',
      summary: 'WorkItem written without a Project anchor.',
    },
  ]) {
    core = upsertCoreWorkItem(core, wiInput, NOW).core;
  }

  // SPEC-090 links — every stored kind plus a cycle.
  for (const linkInput of [
    {
      id: 'link-block-1',
      kind: 'blocks' as const,
      sourceRecordFamily: 'task' as const,
      sourceRecordId: 'task-hero-copy',
      targetRecordFamily: 'task' as const,
      targetRecordId: 'task-deploy',
      note: 'Deploy waits on approved hero copy.',
    },
    {
      id: 'link-related-1',
      kind: 'related_to' as const,
      sourceRecordFamily: 'project' as const,
      sourceRecordId: 'proj-bf',
      targetRecordFamily: 'project' as const,
      targetRecordId: 'proj-cs',
    },
    {
      id: 'link-duplicate-1',
      kind: 'duplicate_of' as const,
      sourceRecordFamily: 'task' as const,
      sourceRecordId: 'task-read-transcripts',
      targetRecordFamily: 'task' as const,
      targetRecordId: 'task-write-spec',
    },
    {
      id: 'link-follows-1',
      kind: 'follows' as const,
      sourceRecordFamily: 'project' as const,
      sourceRecordId: 'proj-rd-hire',
      targetRecordFamily: 'project' as const,
      targetRecordId: 'proj-bf',
    },
    {
      id: 'link-cycle-a',
      kind: 'blocks' as const,
      sourceRecordFamily: 'work_item' as const,
      sourceRecordId: 'wi-bottleneck',
      targetRecordFamily: 'work_item' as const,
      targetRecordId: 'wi-orphan',
    },
    {
      id: 'link-cycle-b',
      kind: 'blocks' as const,
      sourceRecordFamily: 'work_item' as const,
      sourceRecordId: 'wi-orphan',
      targetRecordFamily: 'work_item' as const,
      targetRecordId: 'wi-bottleneck',
    },
  ]) {
    core = upsertCoreWorkGraphLink(core, linkInput, NOW).core;
  }

  // Note: orphan link (target → task-deleted-fixture) is added via
  // direct workGraphLinks push since upsertCoreWorkGraphLink validates
  // endpoint resolution.
  core = {
    ...core,
    workGraphLinks: [
      ...core.workGraphLinks,
      {
        id: 'link-orphan-1',
        kind: 'blocks',
        sourceRecordFamily: 'work_item',
        sourceRecordId: 'wi-landing',
        targetRecordFamily: 'task',
        targetRecordId: 'task-deleted-fixture',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        createdByActorId: null,
        note: null,
        metadata: {},
      },
    ],
  };

  return buildWorkGraphProjection(core);
})();
