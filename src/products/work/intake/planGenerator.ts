import { randomUUID } from 'node:crypto';

import {
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../../../core/model/planningRecords.js';
import {
  upsertCoreTask,
} from '../../../core/model/taskControls.js';
import {
  appendCoreActivity,
} from '../../../core/model/executionRecords.js';
import {
  replaceById,
  touchCoreState,
} from '../../../core/model/shared.js';
import {
  writeTaskPlanningMetadata,
} from '../../../shared/taskPlanning.js';
import type { CatsCoreState, CoreConversationRecord } from '../../../core/types.js';
import type { WorkTemplate } from '../templates/types.js';
import type {
  GenerateWorkIntakePlanResult,
  WorkIntakeInput,
} from './types.js';

function buildIntakeMetadata(
  input: WorkIntakeInput,
): Record<string, unknown> {
  return {
    intake: {
      templateId: input.templateId,
      brief: input.brief,
      desiredOutcome: input.desiredOutcome,
      ...(input.deadline ? { deadline: input.deadline } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
  };
}

export function normalizeWorkIntakeInput(input: WorkIntakeInput): WorkIntakeInput {
  return {
    title: input.title.trim(),
    brief: input.brief.trim(),
    desiredOutcome: input.desiredOutcome.trim(),
    repoPath: input.repoPath?.trim() || null,
    deadline: input.deadline?.trim() || null,
    priority: input.priority ?? null,
    templateId: input.templateId.trim(),
  };
}

export function generateWorkIntakePlan(
  core: CatsCoreState,
  input: WorkIntakeInput,
  template: WorkTemplate,
  now: Date = new Date(),
): GenerateWorkIntakePlanResult {
  let nextCore = core;
  const normalizedInput = normalizeWorkIntakeInput(input);
  const normalizedRepoPath = normalizedInput.repoPath ?? null;

  // 1. Create project
  const projectResult = upsertCoreProject(nextCore, {
    title: normalizedInput.title,
    status: 'planned',
    summary: normalizedInput.brief,
    repoPath: normalizedRepoPath,
    metadata: buildIntakeMetadata(normalizedInput),
  }, now);
  nextCore = projectResult.core;
  const project = projectResult.project;

  // 2. Create top-level work item
  const workItemResult = upsertCoreWorkItem(nextCore, {
    title: normalizedInput.title,
    status: 'draft',
    projectId: project.id,
    summary: normalizedInput.desiredOutcome,
  }, now);
  nextCore = workItemResult.core;
  const workItem = workItemResult.workItem;

  // 3. Create a work_thread conversation for this project
  const ownerActorId = nextCore.ownerProfile.actorId;
  const conversationId = `conv-work-${randomUUID()}`;
  const conversation: CoreConversationRecord = {
    id: conversationId,
    title: normalizedInput.title,
    kind: 'work_thread',
    status: 'planned',
    containerId: null,
    participantActorIds: [ownerActorId],
    sourceChannelId: null,
    repoPath: normalizedRepoPath,
    responseLanguage: 'en',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastMessageAt: null,
  };
  const conversationResult = replaceById(nextCore.conversations, conversation);
  nextCore = touchCoreState({
    ...nextCore,
    conversations: conversationResult.records,
  }, now.toISOString());

  // Link project to the conversation
  const projectLinkResult = upsertCoreProject(nextCore, {
    id: project.id,
    title: project.title,
    primaryConversationId: conversationId,
  }, now);
  nextCore = projectLinkResult.core;
  const linkedProject = projectLinkResult.project;

  // 4. Create activity for project creation
  const projectActivityResult = appendCoreActivity(nextCore, {
    kind: 'note',
    projectId: project.id,
    workItemId: workItem.id,
    conversationId,
    message: `Work intake created: "${normalizedInput.title}" using template "${template.label}".`,
  }, now);
  nextCore = projectActivityResult.core;

  // 5. First pass: create all tasks with owner auto-assigned (without dependsOnTaskIds)
  const blueprintKeyToTaskId = new Map<string, string>();
  const createdTasks = [];

  for (const blueprint of template.taskBlueprints) {
    const planningMetadata = writeTaskPlanningMetadata(null, {
      productHint: blueprint.productHint,
      strategyHint: blueprint.strategyHint,
      acceptanceCriteria: blueprint.acceptanceCriteria,
      dependsOnTaskIds: [],
    });

    const taskResult = upsertCoreTask(nextCore, {
      title: blueprint.title,
      status: 'draft',
      conversationId,
      ownerActorId,
      assignedActorIds: [ownerActorId],
      summary: blueprint.summary,
      metadata: {
        ...planningMetadata,
        workIntake: {
          blueprintKey: blueprint.key,
          roleKey: blueprint.roleKey,
          projectId: project.id,
          workItemId: workItem.id,
        },
      },
    }, now);
    nextCore = taskResult.core;
    blueprintKeyToTaskId.set(blueprint.key, taskResult.task.id);
    createdTasks.push({ task: taskResult.task, blueprint });
  }

  // 5. Second pass: patch dependsOnTaskIds for tasks that have dependencies
  const finalTasks = [];
  for (const { task, blueprint } of createdTasks) {
    if (blueprint.dependsOnKeys.length === 0) {
      finalTasks.push(task);
      continue;
    }

    const dependsOnTaskIds = blueprint.dependsOnKeys
      .map((key) => blueprintKeyToTaskId.get(key))
      .filter((id): id is string => id !== undefined);

    if (dependsOnTaskIds.length === 0) {
      finalTasks.push(task);
      continue;
    }

    const patchedMetadata = writeTaskPlanningMetadata(task.metadata, {
      productHint: blueprint.productHint,
      strategyHint: blueprint.strategyHint,
      acceptanceCriteria: blueprint.acceptanceCriteria,
      dependsOnTaskIds,
    });

    const patchResult = upsertCoreTask(nextCore, {
      id: task.id,
      title: task.title,
      status: task.status,
      conversationId: task.conversationId,
      ownerActorId: task.ownerActorId,
      assignedActorIds: task.assignedActorIds,
      summary: task.summary,
      metadata: {
        ...patchedMetadata,
        workIntake: {
          blueprintKey: blueprint.key,
          roleKey: blueprint.roleKey,
          projectId: project.id,
          workItemId: workItem.id,
        },
      },
    }, now);
    nextCore = patchResult.core;
    finalTasks.push(patchResult.task);
  }

  // 6. Link first task to work item
  if (finalTasks.length > 0) {
    const firstTask = finalTasks[0]!;
    const linkResult = upsertCoreWorkItem(nextCore, {
      id: workItem.id,
      title: workItem.title,
      taskId: firstTask.id,
    }, now);
    nextCore = linkResult.core;
  }

  // 7. Create activity records for each task
  const activities = [projectActivityResult.activity];
  for (const task of finalTasks) {
    const activityResult = appendCoreActivity(nextCore, {
      kind: 'note',
      projectId: project.id,
      workItemId: workItem.id,
      taskId: task.id,
      message: `Draft task created: "${task.title}".`,
    }, now);
    nextCore = activityResult.core;
    activities.push(activityResult.activity);
  }

  return {
    core: nextCore,
    plan: {
      project: linkedProject,
      workItem,
      tasks: finalTasks,
      activities,
      template,
    },
  };
}
