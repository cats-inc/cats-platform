import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreActorRecord,
  CoreApprovalBindingRecord,
  CoreArtifactRecord,
  CoreConversationRecord,
  CoreOrchestrationOutcomeRecord,
  CoreProjectRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreWorkGraphLinkRecord,
  CoreWorkItemRecord,
  MissionRecord,
} from '../../../core/types.js';
import {
  endpointKey,
  projectLinks,
} from '../shared/workGraphProjection.js';
import type {
  WorkAttentionState,
  WorkGraphDiagnostic,
  WorkGraphEvidenceAttachment,
  WorkGraphGateDecorator,
  WorkGraphLink,
  WorkGraphObjectSummary,
  WorkGraphProjection,
} from '../shared/workGraphTypes.js';
import {
  detectIncompleteWorkClaim,
  resolveTaskProductBinding,
} from './projectionSupport.js';

/**
 * Build a complete `WorkGraphProjection` from canonical Core state.
 * Renderer surfaces (System Map / Cockpit / Broken Links / detail pages)
 * read this projection through `GET /api/work/graph`; there is no
 * renderer-side mock once this projection is wired.
 *
 * Empty Core → empty projection. The renderer is expected to render an
 * empty state in that case.
 */
export function buildWorkGraphProjection(core: CatsCoreState): WorkGraphProjection {
  const taskTitleById = new Map<string, string>();
  for (const task of core.tasks) {
    taskTitleById.set(task.id, task.title);
  }
  const workItemTitleById = new Map<string, string>();
  for (const workItem of core.workItems) {
    workItemTitleById.set(workItem.id, workItem.title);
  }
  const conversationTitleById = new Map<string, string>();
  for (const conversation of core.conversations) {
    conversationTitleById.set(conversation.id, conversation.title || conversation.id);
  }

  const objects: WorkGraphObjectSummary[] = [
    ...core.projects.map((p) => projectToSummary(p, conversationTitleById)),
    ...core.workItems.map((wi) =>
      workItemToSummary(wi, workItemTitleById, conversationTitleById),
    ),
    ...core.tasks.map((task) =>
      taskToSummary(task, core, taskTitleById, conversationTitleById),
    ),
    ...core.conversations.map(conversationToSummary),
    ...core.actors
      .filter((actor) => actor.kind !== 'owner' && actor.status === 'active')
      .map(actorToSummary),
    ...core.missions.map((m) => missionToSummary(m, conversationTitleById)),
    ...core.runs.map((run) =>
      runToSummary(run, taskTitleById, conversationTitleById),
    ),
    ...core.artifacts.map((a) => artifactToSummary(a, conversationTitleById)),
    ...core.activities.map((a) => activityToSummary(a, conversationTitleById)),
    ...core.outcomes.map((o) => outcomeToSummary(o, conversationTitleById)),
    ...core.approvalBindings.map((b) =>
      approvalBindingToSummary(b, conversationTitleById),
    ),
  ];

  const evidenceAttachments: WorkGraphEvidenceAttachment[] = [
    ...core.artifacts.flatMap((a) =>
      pickAnchors(a as unknown as Record<string, unknown>, [
        'workItemId',
        'taskId',
        'runId',
        'projectId',
        'conversationId',
      ]).map((anchorObjectId) => ({
        evidenceObjectId: a.id,
        anchorObjectId,
        relation: 'artifact' as const,
      })),
    ),
    ...core.activities.flatMap((a) =>
      pickAnchors(a as unknown as Record<string, unknown>, [
        'workItemId',
        'taskId',
        'runId',
        'projectId',
        'conversationId',
        'artifactId',
      ]).map((anchorObjectId) => ({
        evidenceObjectId: a.id,
        anchorObjectId,
        relation: 'activity' as const,
      })),
    ),
    ...core.outcomes.flatMap((o) =>
      pickAnchors(o as unknown as Record<string, unknown>, [
        'taskId',
        'runId',
        'conversationId',
      ]).map((anchorObjectId) => ({
        evidenceObjectId: o.id,
        anchorObjectId,
        relation: 'outcome' as const,
      })),
    ),
  ];

  const gateDecorators: WorkGraphGateDecorator[] = core.approvalBindings.map(
    (binding) => ({
      gateObjectId: binding.id,
      subjectObjectId: binding.subjectId,
      state: deriveApprovalState(core, binding),
    }),
  );

  const links: WorkGraphLink[] = core.workGraphLinks.map(linkRecordToLink);

  const objectsByCoreRef = new Map<string, WorkGraphObjectSummary>();
  for (const o of objects) {
    objectsByCoreRef.set(endpointKey({
      recordFamily: o.sourceRecordFamily as never,
      recordId: o.sourceRecordId,
    }), o);
  }
  const linkProjection = projectLinks(links, objectsByCoreRef);

  // ADR-081 §2B / SPEC-083 R45: a task carrying Work-flavoured signal
  // (`planning.productHint = 'work'`, `planning.transfer.suggestedProduct
  // = 'work'`, or a `work_thread` conversation) without a `WorkItem.taskId`
  // bridge is an incomplete Work claim. `resolveTaskProductBinding`
  // demotes it to `'unbound'`; the projection emits a parallel
  // `missing_planning_execution_bridge` diagnostic so the demotion is
  // not silent and the task surfaces as repair candidate rather than
  // anonymous orphan triage.
  const incompleteWorkClaimDiagnostics: WorkGraphDiagnostic[] = core.tasks
    .filter((task) => detectIncompleteWorkClaim(core, task))
    .map((task) => ({
      id: `incomplete-work-claim:${task.id}`,
      severity: 'warning',
      category: 'anchor',
      kind: 'missing_planning_execution_bridge',
      objectId: task.id,
      message: `Task "${task.title}" carries Work-flavoured signal but no `
        + `WorkItem.taskId bridge; projecting as 'unbound' until a `
        + `WorkItem links to this task or the Work claim is retracted.`,
    }));

  return {
    objects,
    evidenceAttachments,
    gateDecorators,
    links,
    linksByEndpoint: linkProjection.linksByEndpoint,
    diagnostics: [...linkProjection.diagnostics, ...incompleteWorkClaimDiagnostics],
  };
}

function projectToSummary(
  p: CoreProjectRecord,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: p.id,
    kind: 'project',
    structuralLayer: 'planning',
    sourceRecordFamily: 'project',
    sourceRecordId: p.id,
    title: p.title,
    status: p.status,
    summary: p.summary,
    attention: deriveAttention(p.status),
    ownerRole: null,
    nextAction: null,
    linkedConversationId: p.primaryConversationId,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: null,
    linkedRunId: null,
    updatedAt: p.updatedAt,
    linkedConversationTitle: p.primaryConversationId
      ? conversationTitleById.get(p.primaryConversationId) ?? null
      : null,
  };
}

function workItemToSummary(
  w: CoreWorkItemRecord,
  workItemTitleById: Map<string, string>,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: w.id,
    kind: 'work_item',
    structuralLayer: 'planning',
    sourceRecordFamily: 'work_item',
    sourceRecordId: w.id,
    title: w.title,
    status: w.status,
    summary: w.summary,
    attention: deriveAttention(w.status),
    ownerRole: null,
    nextAction: null,
    linkedConversationId: w.conversationId,
    linkedProjectId: w.projectId,
    linkedWorkItemId: w.parentWorkItemId,
    linkedTaskId: w.taskId,
    linkedRunId: null,
    updatedAt: w.updatedAt,
    linkedWorkItemTitle: w.parentWorkItemId
      ? workItemTitleById.get(w.parentWorkItemId) ?? null
      : null,
    linkedConversationTitle: w.conversationId
      ? conversationTitleById.get(w.conversationId) ?? null
      : null,
  };
}

function taskToSummary(
  t: CoreTaskRecord,
  core: CatsCoreState,
  taskTitleById: Map<string, string>,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  const parentTaskTitle = t.parentTaskId
    ? taskTitleById.get(t.parentTaskId) ?? null
    : null;
  return {
    id: t.id,
    kind: 'task',
    structuralLayer: 'execution',
    sourceRecordFamily: 'task',
    sourceRecordId: t.id,
    title: t.title,
    status: t.status,
    summary: t.summary,
    attention: deriveAttention(t.status),
    ownerRole: null,
    nextAction: null,
    linkedConversationId: t.conversationId,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: t.parentTaskId ?? null,
    linkedRunId: null,
    updatedAt: t.updatedAt,
    metadata: t.metadata ?? null,
    productBinding: resolveTaskProductBinding(core, t),
    linkedTaskTitle: parentTaskTitle,
    linkedConversationTitle: t.conversationId
      ? conversationTitleById.get(t.conversationId) ?? null
      : null,
  };
}

function conversationToSummary(c: CoreConversationRecord): WorkGraphObjectSummary {
  return {
    id: c.id,
    kind: 'conversation',
    structuralLayer: 'interaction',
    sourceRecordFamily: 'conversation',
    sourceRecordId: c.id,
    title: c.title || c.id,
    status: c.status,
    summary: null,
    attention: deriveAttention(c.status),
    ownerRole: null,
    nextAction: null,
    linkedConversationId: null,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: null,
    linkedRunId: null,
    updatedAt: c.updatedAt,
  };
}

function actorToSummary(actor: CoreActorRecord): WorkGraphObjectSummary {
  return {
    id: actor.id,
    kind: 'agent',
    structuralLayer: 'interaction',
    sourceRecordFamily: 'agent',
    sourceRecordId: actor.id,
    title: actor.name,
    status: actor.status,
    summary: null,
    attention: 'none',
    ownerRole: actor.roles?.[0] ?? null,
    nextAction: null,
    linkedConversationId: null,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: null,
    linkedRunId: null,
    updatedAt: actor.updatedAt,
  };
}

function missionToSummary(
  m: MissionRecord,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: m.id,
    kind: 'mission',
    structuralLayer: 'execution',
    sourceRecordFamily: 'mission',
    sourceRecordId: m.id,
    title: m.title,
    status: m.status,
    summary: m.summary ?? null,
    attention: deriveAttention(m.status),
    ownerRole: null,
    nextAction: null,
    linkedConversationId: m.conversationId ?? null,
    linkedProjectId: null,
    linkedWorkItemId: m.managedWorkId ?? null,
    linkedTaskId: null,
    linkedRunId: null,
    updatedAt: m.updatedAt,
    linkedConversationTitle: m.conversationId
      ? conversationTitleById.get(m.conversationId) ?? null
      : null,
  };
}

function runToSummary(
  r: CoreRunRecord,
  taskTitleById: Map<string, string>,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: r.id,
    kind: 'run',
    structuralLayer: 'execution',
    sourceRecordFamily: 'run',
    sourceRecordId: r.id,
    title: r.title,
    status: r.status,
    summary: r.summary,
    attention: deriveAttention(r.status),
    ownerRole: null,
    nextAction: null,
    linkedConversationId: r.conversationId,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: r.taskId,
    linkedRunId: r.parentRunId,
    updatedAt: r.updatedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    linkedTaskTitle: r.taskId ? taskTitleById.get(r.taskId) ?? null : null,
    linkedConversationTitle: r.conversationId
      ? conversationTitleById.get(r.conversationId) ?? null
      : null,
  };
}

function artifactToSummary(
  a: CoreArtifactRecord,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: a.id,
    kind: 'artifact',
    structuralLayer: null,
    sourceRecordFamily: 'artifact',
    sourceRecordId: a.id,
    title: a.title,
    status: a.status,
    summary: a.summary,
    attention: 'none',
    ownerRole: null,
    nextAction: null,
    linkedConversationId: a.conversationId,
    linkedProjectId: a.projectId,
    linkedWorkItemId: a.workItemId,
    linkedTaskId: a.taskId,
    linkedRunId: a.runId,
    updatedAt: a.updatedAt,
    linkedConversationTitle: a.conversationId
      ? conversationTitleById.get(a.conversationId) ?? null
      : null,
  };
}

function activityToSummary(
  a: CoreActivityRecord,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: a.id,
    kind: 'activity',
    structuralLayer: null,
    sourceRecordFamily: 'activity',
    sourceRecordId: a.id,
    title: a.message.slice(0, 80),
    status: 'recorded',
    summary: a.message,
    attention: 'none',
    ownerRole: null,
    nextAction: null,
    linkedConversationId: a.conversationId,
    linkedProjectId: a.projectId,
    linkedWorkItemId: a.workItemId,
    linkedTaskId: a.taskId,
    linkedRunId: a.runId,
    updatedAt: a.createdAt,
    linkedConversationTitle: a.conversationId
      ? conversationTitleById.get(a.conversationId) ?? null
      : null,
  };
}

function outcomeToSummary(
  o: CoreOrchestrationOutcomeRecord,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: o.id,
    kind: 'outcome',
    structuralLayer: null,
    sourceRecordFamily: 'outcome',
    sourceRecordId: o.id,
    title: o.title,
    status: o.status,
    summary: o.summary,
    attention: deriveAttention(o.status),
    ownerRole: null,
    nextAction: null,
    linkedConversationId: o.conversationId,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: o.taskId,
    linkedRunId: o.runId,
    updatedAt: o.updatedAt,
    linkedConversationTitle: o.conversationId
      ? conversationTitleById.get(o.conversationId) ?? null
      : null,
  };
}

function approvalBindingToSummary(
  b: CoreApprovalBindingRecord,
  conversationTitleById: Map<string, string>,
): WorkGraphObjectSummary {
  return {
    id: b.id,
    kind: 'approval_binding',
    structuralLayer: null,
    sourceRecordFamily: 'approval_binding',
    sourceRecordId: b.id,
    title: `Approval: ${b.subjectKind}`,
    status: b.kind,
    summary: null,
    attention: 'none',
    ownerRole: null,
    nextAction: null,
    linkedConversationId: b.conversationId,
    linkedProjectId: b.projectId,
    linkedWorkItemId: b.workItemId,
    linkedTaskId: b.approvalTaskId,
    linkedRunId: null,
    updatedAt: b.updatedAt,
    linkedConversationTitle: b.conversationId
      ? conversationTitleById.get(b.conversationId) ?? null
      : null,
  };
}

function linkRecordToLink(link: CoreWorkGraphLinkRecord): WorkGraphLink {
  return {
    id: link.id,
    kind: link.kind,
    sourceRecordFamily: link.sourceRecordFamily,
    sourceRecordId: link.sourceRecordId,
    targetRecordFamily: link.targetRecordFamily,
    targetRecordId: link.targetRecordId,
    createdAt: link.createdAt,
    createdByActorId: link.createdByActorId,
    note: link.note,
  };
}

const ATTENTION_BY_STATUS: Record<string, WorkAttentionState> = {
  pending_approval: 'decision_needed',
  blocked: 'blocked',
  failed: 'failed',
  cancelled: 'failed',
  completed: 'recently_shipped',
};

function deriveAttention(status: string): WorkAttentionState {
  return ATTENTION_BY_STATUS[status] ?? 'none';
}

function pickAnchors(
  record: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  const anchors: string[] = [];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      anchors.push(value);
    }
  }
  return anchors;
}

function deriveApprovalState(
  core: CatsCoreState,
  binding: CoreApprovalBindingRecord,
): WorkGraphGateDecorator['state'] {
  const approvalTask = core.tasks.find((t) => t.id === binding.approvalTaskId);
  if (!approvalTask) return 'pending';
  switch (approvalTask.approval.status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'pending':
      return 'pending';
    case 'not_requested':
    default:
      return 'not_requested';
  }
}

