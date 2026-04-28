import { readTaskPlanningMetadataFromTask } from '../../../shared/taskPlanning.js';
import type {
  CatsCoreState,
  CoreProjectStatus,
  CoreTaskRecord,
  CoreWorkItemStatus,
} from '../../../core/types.js';
import type { WorkTaskProductBinding } from '../shared/workGraphTypes.js';

export function buildTaskStatusCounts(tasks: CoreTaskRecord[]): Record<CoreTaskRecord['status'], number> {
  return tasks.reduce<Record<CoreTaskRecord['status'], number>>(
    (counts, task) => {
      counts[task.status] += 1;
      return counts;
    },
    {
      draft: 0,
      pending_approval: 0,
      approved: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
      archived: 0,
    },
  );
}

export function resolveTaskProductBinding(
  core: CatsCoreState,
  task: CoreTaskRecord,
): WorkTaskProductBinding {
  // Precedence (mirrors `isCodeTask` artifact-first composite + ADR-081 §2B):
  //   1. structural Work bridge (`WorkItem.taskId`) → 'work'
  //   2. Code-owned artifact (`build` | `preview`) → 'code'
  //   3. explicit planning provenance (`productHint` or
  //      `transfer.suggestedProduct`) → that product
  //      ('work' explicit hint without bridge → 'unbound' incomplete-claim)
  //   4. legacy conversation-kind fallback for `code_thread` only;
  //      chat-* / work_thread conversations alone do NOT bind, per the
  //      deliberate-only producer rule for Chat Tasks and the structural
  //      requirement for Work binding.
  // We deliberately do not call `resolveTaskExecutionProduct` here because
  // its conversation-kind fallback would admit chat-* conversations as
  // 'chat', which contradicts the producer rule; this routine encodes the
  // projection-side rules end-to-end so the precedence stays auditable in
  // one place.
  if (core.workItems.some((workItem) => workItem.taskId === task.id)) {
    return 'work';
  }
  if (core.artifacts.some((artifact) => artifact.taskId === task.id && (
    artifact.kind === 'build' || artifact.kind === 'preview'
  ))) {
    return 'code';
  }

  const planning = readTaskPlanningMetadataFromTask(task);
  const explicit = planning.productHint ?? planning.transfer?.suggestedProduct ?? null;
  if (explicit === 'code') {
    return 'code';
  }
  if (explicit === 'chat') {
    return 'chat';
  }
  if (explicit === 'work') {
    // Work-flavoured metadata without `WorkItem.taskId` is an incomplete
    // Work claim — surfaced separately as a diagnostic (see SPEC-083 §
    // Diagnostic minimum), not admitted as managed Work.
    return 'unbound';
  }

  if (task.conversationId) {
    const conversation = core.conversations.find(
      (candidate) => candidate.id === task.conversationId,
    );
    if (conversation?.kind === 'code_thread') {
      return 'code';
    }
  }

  return 'unbound';
}

export function isWorkTask(core: CatsCoreState, task: CoreTaskRecord): boolean {
  return resolveTaskProductBinding(core, task) === 'work';
}

export function buildProjectStatusCounts(core: CatsCoreState): Record<CoreProjectStatus, number> {
  return core.projects.reduce<Record<CoreProjectStatus, number>>(
    (counts, project) => {
      counts[project.status] += 1;
      return counts;
    },
    { planned: 0, active: 0, paused: 0, archived: 0 },
  );
}

export function buildWorkItemStatusCounts(core: CatsCoreState): Record<CoreWorkItemStatus, number> {
  return core.workItems.reduce<Record<CoreWorkItemStatus, number>>(
    (counts, workItem) => {
      counts[workItem.status] += 1;
      return counts;
    },
    {
      draft: 0,
      planned: 0,
      ready: 0,
      in_progress: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
      archived: 0,
    },
  );
}

export function resolveActorName(core: CatsCoreState, actorId: string | null | undefined): string {
  if (!actorId) {
    return 'Unknown owner';
  }

  if (actorId === core.ownerProfile.actorId) {
    return core.ownerProfile.displayName;
  }

  return core.actors.find((actor) => actor.id === actorId)?.name ?? actorId;
}

export function resolveConversationTitle(
  core: CatsCoreState,
  conversationId: string | null,
): string | null {
  if (!conversationId) {
    return null;
  }

  return core.conversations.find((conversation) => conversation.id === conversationId)?.title ?? null;
}
