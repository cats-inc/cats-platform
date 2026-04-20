import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import {
  buildWorkflowContinuationReplayRequest,
  writeWorkflowContinuationReplayMetadata,
} from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import {
  isPlatformNonProductPath,
  resolvePreferredPlatformSurface,
  resolvePlatformShellSurface,
  resolvePlatformSurfaceForPath,
  PLATFORM_SURFACE_ROUTES,
} from '../build/server/app/renderer/routeMap.js';
import {
  platformSurfaceLabel,
  listPlatformSurfaceDescriptors,
  platformSurfaceRoutePrefix,
  platformSurfaceSubtitle,
} from '../build/server/core/platformSurface.js';
import {
  resolvePlatformSurfaceRoutePrefix,
} from '../build/server/shared/platformProducts.js';
import {
  buildWorkDashboardProjection,
  buildWorkProjectListProjection,
  buildWorkProjectDetailProjection,
  buildWorkTaskListProjection,
  buildWorkTaskDetailProjection,
  buildWorkWorkItemListProjection,
  buildWorkWorkItemDetailProjection,
} from '../build/server/products/work/api/projection.js';
import {
  buildCodeDashboardProjection,
} from '../build/server/products/code/api/projection.js';

test('resolvePlatformSurfaceForPath routes work and code prefixes to their dedicated platform surfaces', () => {
  assert.equal(resolvePlatformSurfaceForPath('/'), 'chat');
  assert.equal(resolvePlatformSurfaceForPath('/chat'), 'chat');
  assert.equal(resolvePlatformSurfaceForPath('/chat/chats/abc'), 'chat');
  assert.equal(resolvePlatformSurfaceForPath('/work'), 'work');
  assert.equal(resolvePlatformSurfaceForPath('/work/war-room'), 'work');
  assert.equal(resolvePlatformSurfaceForPath('/code'), 'code');
  assert.equal(resolvePlatformSurfaceForPath('/code/projects/demo'), 'code');

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PLATFORM_SURFACE_ROUTES).map(([surface, route]) => [
        surface,
        { routePrefix: route.routePrefix, placeholder: route.placeholder, apiBase: route.apiBase },
      ]),
    ),
    {
      chat: { routePrefix: '/chat', placeholder: false, apiBase: null },
      work: { routePrefix: '/work', placeholder: false, apiBase: '/api/work' },
      code: { routePrefix: '/code', placeholder: false, apiBase: '/api/code' },
    },
  );
});

test('platform surface descriptors expose product switcher metadata and stable root routes', () => {
  assert.deepEqual(
    listPlatformSurfaceDescriptors().map((descriptor) => ({
      id: descriptor.id,
      routePrefix: descriptor.routePrefix,
      subtitle: descriptor.subtitle,
      maturity: descriptor.maturity,
    })),
    [
      {
        id: 'chat',
        routePrefix: '/chat',
        subtitle: 'Conversations with companions and personal agents',
        maturity: 'active',
      },
      {
        id: 'code',
        routePrefix: '/code',
        subtitle: 'Repos, runs, and coding workspace',
        maturity: 'preview',
      },
      {
        id: 'work',
        routePrefix: '/work',
        subtitle: 'Projects, approvals, and operator workflow',
        maturity: 'preview',
      },
    ],
  );
  assert.equal(platformSurfaceRoutePrefix('chat'), '/chat');
  assert.equal(platformSurfaceRoutePrefix('work'), '/work');
  assert.equal(platformSurfaceRoutePrefix('code'), '/code');
  assert.equal(platformSurfaceLabel('chat'), 'Chat');
  assert.equal(platformSurfaceLabel('work'), 'Work');
  assert.equal(platformSurfaceLabel('code'), 'Code');
  assert.equal(resolvePlatformSurfaceRoutePrefix('chat'), '/chat');
  assert.equal(resolvePlatformSurfaceRoutePrefix('work'), '/work');
  assert.equal(resolvePlatformSurfaceRoutePrefix('code'), '/code');
  assert.equal(
    platformSurfaceSubtitle('code'),
    'Repos, runs, and coding workspace',
  );
});

test('isPlatformNonProductPath excludes only canonical platform routes from product sync', () => {
  assert.equal(isPlatformNonProductPath('/setup'), true);
  assert.equal(isPlatformNonProductPath('/lobby'), true);
  assert.equal(isPlatformNonProductPath('/products'), true);
  assert.equal(isPlatformNonProductPath('/settings'), true);
  assert.equal(isPlatformNonProductPath('/settings/general'), true);
  assert.equal(isPlatformNonProductPath('/chat/settings'), false);
  assert.equal(isPlatformNonProductPath('/chat/settings/general'), false);
  assert.equal(isPlatformNonProductPath('/chat/new'), false);
  assert.equal(isPlatformNonProductPath('/work'), false);
});

test('resolvePlatformShellSurface keeps settings inside the last active product shell', () => {
  assert.equal(resolvePlatformShellSurface('/settings/general', 'work'), 'work');
  assert.equal(resolvePlatformShellSurface('/settings/runtime', 'code'), 'code');
  assert.equal(resolvePlatformShellSurface('/settings/chat', null), 'chat');
  assert.equal(resolvePlatformShellSurface('/work', 'chat'), 'work');
  assert.equal(resolvePlatformShellSurface('/code/build', 'work'), 'code');
});

test('resolvePreferredPlatformSurface prioritizes explicit settings route state before session and stored fallbacks', () => {
  assert.equal(resolvePreferredPlatformSurface('code', 'work', 'chat', 'chat'), 'code');
  assert.equal(resolvePreferredPlatformSurface(null, 'work', 'chat', 'chat'), 'work');
  assert.equal(resolvePreferredPlatformSurface(null, null, 'code', 'chat'), 'code');
  assert.equal(resolvePreferredPlatformSurface(null, null, null, 'work'), 'work');
  assert.equal(resolvePreferredPlatformSurface(null, null, null, null), 'chat');
});

test('Work and Code dashboard projections stay core-backed without inventing new schemas', () => {
  const core = createDefaultCoreState();

  const work = buildWorkDashboardProjection(core);
  const code = buildCodeDashboardProjection(core);

  assert.equal(work.summary.ownerActorId, core.ownerProfile.actorId);
  assert.equal(code.summary.ownerActorId, core.ownerProfile.actorId);
  assert.equal(work.summary.actorCount, core.actors.length);
  assert.equal(work.product.status, 'active');
  assert.equal(work.sections.projects.summary.totalAvailable, 0);
  assert.equal(work.sections.workItems.summary.totalAvailable, 0);
  assert.equal(work.sections.operatorInbox.summary.totalAvailable, 0);
  assert.equal(work.sections.controlPlane.summary.totalAvailable, 0);
  assert.equal(work.sections.recovery.summary.totalAvailable, 0);
  assert.equal(code.summary.conversationCount, core.conversations.length);
  assert.equal(code.product.status, 'active');
  assert.equal(code.sections.tasks.summary.totalAvailable, 0);
  assert.equal(code.sections.artifacts.summary.totalAvailable, 0);
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/projects'));
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/tasks'));
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/work-items'));
  assert.ok(work.extensionPoints.futureRoutes.includes('/api/work/war-room'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/tasks'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/artifacts'));
  assert.ok(code.extensionPoints.futureRoutes.includes('/api/code/previews'));
});

test('Work projections preserve briefing-thread channel links from shared conversations', () => {
  const core = createDefaultCoreState();
  const conversationId = 'conversation-work-briefing';
  const sourceChannelId = 'channel-work-briefing';
  const projectId = 'project-work-briefing';
  const taskId = 'task-work-briefing';
  const workItemId = 'work-item-work-briefing';
  core.actors.push({
    id: 'actor-cat-work-reviewer',
    name: 'Work Reviewer',
    kind: 'worker',
    status: 'active',
    roles: ['reviewer'],
    skillProfile: null,
    mcpProfile: null,
    defaultExecutionTarget: null,
    memory: { summary: null, facts: [], openLoops: [], updatedAt: null },
    source: 'core_record',
    sourceId: 'work-reviewer',
    createdAt: '2026-04-15T05:59:00.000Z',
    updatedAt: '2026-04-15T05:59:00.000Z',
    archivedAt: null,
  });

  core.conversations.push({
    id: conversationId,
    title: 'Work briefing thread',
    kind: 'chat_channel',
    status: 'active',
    containerId: null,
    participantActorIds: [core.ownerProfile.actorId],
    sourceChannelId,
    repoPath: null,
    responseLanguage: 'en',
    createdAt: '2026-04-15T06:00:00.000Z',
    updatedAt: '2026-04-15T06:05:00.000Z',
    lastMessageAt: '2026-04-15T06:05:00.000Z',
  });
  core.projects.push({
    id: projectId,
    title: 'Work briefing project',
    status: 'active',
    ownerActorId: core.ownerProfile.actorId,
    summary: 'Track the work handoff.',
    repoPath: null,
    primaryConversationId: conversationId,
    createdAt: '2026-04-15T06:00:00.000Z',
    updatedAt: '2026-04-15T06:05:00.000Z',
    metadata: {},
  });
  core.tasks.push({
    id: taskId,
    title: 'Work briefing task',
    status: 'pending_approval',
    conversationId,
    parentTaskId: null,
    ownerActorId: core.ownerProfile.actorId,
    orchestratorActorId: null,
    assignedActorIds: ['actor-cat-work-reviewer'],
    summary: 'Follow the briefing thread.',
    approval: {
      status: 'pending',
      requestedAt: '2026-04-15T06:01:00.000Z',
      decidedAt: null,
      decidedByActorId: null,
      decisionAction: null,
      notes: null,
    },
    createdAt: '2026-04-15T06:00:00.000Z',
    updatedAt: '2026-04-15T06:05:00.000Z',
    metadata: writeWorkflowContinuationReplayMetadata(
      {},
      buildWorkflowContinuationReplayRequest({
        channelId: sourceChannelId,
        checkpointId: 'checkpoint-work-briefing',
        sourceMessageId: 'message-work-briefing',
        sourceTurnId: 'turn-work-briefing',
        sourceLaneId: 'lane-work-briefing',
        sourceAssistantTurnId: 'assistant-turn-work-briefing',
        sourceParticipant: {
          participantKind: 'cat',
          participantId: 'cat-work-reviewer',
          participantName: 'Work Reviewer',
        },
        targets: [
          {
            participantKind: 'cat',
            participantId: 'cat-work-reviewer',
            participantName: 'Work Reviewer',
          },
        ],
        mentionNames: ['Work Reviewer'],
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
        continuationSource: 'workflow_recommendation',
        blockedReason: 'max_dispatches',
        recordedAt: '2026-04-15T06:02:00.000Z',
      }),
      {
        replayState: 'failed',
        replayTrigger: 'retry',
        replayAttemptAt: '2026-04-15T06:03:00.000Z',
        replayError: 'guard tripped',
      },
    ),
  });
  core.workItems.push({
    id: workItemId,
    title: 'Work briefing item',
    status: 'ready',
    projectId,
    conversationId,
    taskId,
    ownerActorId: core.ownerProfile.actorId,
    assignedActorIds: ['actor-cat-work-reviewer'],
    summary: 'Represent the managed work.',
    createdAt: '2026-04-15T06:00:00.000Z',
    updatedAt: '2026-04-15T06:05:00.000Z',
    metadata: {},
  });

  const projectList = buildWorkProjectListProjection(core);
  const workDashboard = buildWorkDashboardProjection(core);
  const taskList = buildWorkTaskListProjection(core);
  const workItemList = buildWorkWorkItemListProjection(core);
  const projectDetail = buildWorkProjectDetailProjection(core, core.projects[0]);
  const workItemDetail = buildWorkWorkItemDetailProjection(core, core.workItems[0]);
  const taskDetail = buildWorkTaskDetailProjection(core, core.tasks[0]);

  assert.equal(projectList.projects[0].primaryConversationSourceChannelId, sourceChannelId);
  assert.equal(workItemList.workItems[0].conversationSourceChannelId, sourceChannelId);
  assert.equal(workItemList.workItems[0].assignedActors[0]?.actorId, 'actor-cat-work-reviewer');
  assert.equal(workItemList.workItems[0].assignedActors[0]?.displayName, 'Work Reviewer');
  assert.equal(workDashboard.sections.operatorInbox.items[0].taskContext.conversationSourceChannelId, sourceChannelId);
  assert.equal(workDashboard.sections.operatorInbox.items[0].taskContext.assignedActors[0]?.actorId, 'actor-cat-work-reviewer');
  assert.equal(workDashboard.sections.operatorInbox.items[0].taskContext.projectId, projectId);
  assert.equal(workDashboard.sections.operatorInbox.items[0].taskContext.workItemId, workItemId);
  assert.equal(workDashboard.sections.controlPlane.items[0].taskContext.conversationSourceChannelId, sourceChannelId);
  assert.equal(workDashboard.sections.controlPlane.items[0].taskContext.assignedActors[0]?.displayName, 'Work Reviewer');
  assert.equal(workDashboard.sections.controlPlane.items[0].taskContext.projectTitle, 'Work briefing project');
  assert.equal(workDashboard.sections.controlPlane.items[0].taskContext.workItemTitle, 'Work briefing item');
  assert.equal(workDashboard.sections.recovery.items[0].taskContext.conversationSourceChannelId, sourceChannelId);
  assert.equal(workDashboard.sections.recovery.items[0].taskContext.assignedActors[0]?.actorId, 'actor-cat-work-reviewer');
  assert.equal(workDashboard.sections.recovery.items[0].taskContext.projectId, projectId);
  assert.equal(workDashboard.sections.recovery.items[0].taskContext.workItemId, workItemId);
  assert.equal(taskList.tasks[0].conversationSourceChannelId, sourceChannelId);
  assert.equal(taskList.tasks[0].projectId, projectId);
  assert.equal(taskList.tasks[0].workItemId, workItemId);
  assert.equal(taskList.tasks[0].assignedActors[0]?.displayName, 'Work Reviewer');
  assert.equal(taskList.tasks[0].controlPlane.taskId, taskId);
  assert.equal(taskList.tasks[0].recovery.taskId, taskId);
  assert.equal(projectDetail.primaryConversation?.sourceChannelId, sourceChannelId);
  assert.equal(projectDetail.linkedTasks[0].conversationSourceChannelId, sourceChannelId);
  assert.equal(projectDetail.linkedTasks[0].assignedActors[0]?.actorId, 'actor-cat-work-reviewer');
  assert.equal(projectDetail.linkedTasks[0].assignedActors[0]?.displayName, 'Work Reviewer');
  assert.equal(workItemDetail.conversation?.sourceChannelId, sourceChannelId);
  assert.equal(taskDetail.project?.id, projectId);
  assert.equal(taskDetail.workItem?.id, workItemId);
  assert.equal(taskDetail.conversation?.sourceChannelId, sourceChannelId);
  assert.equal(taskDetail.assignedActors[0]?.actorId, 'actor-cat-work-reviewer');
  assert.equal(taskDetail.assignedActors[0]?.displayName, 'Work Reviewer');
});
