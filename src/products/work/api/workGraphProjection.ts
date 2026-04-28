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
  WorkGraphEvidenceAttachment,
  WorkGraphGateDecorator,
  WorkGraphLink,
  WorkGraphObjectSummary,
  WorkGraphProjection,
} from '../shared/workGraphTypes.js';

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
  const objects: WorkGraphObjectSummary[] = [
    ...core.projects.map(projectToSummary),
    ...core.workItems.map(workItemToSummary),
    ...core.tasks.map(taskToSummary),
    ...core.conversations.map(conversationToSummary),
    ...core.actors
      .filter((actor) => actor.kind !== 'owner' && actor.status === 'active')
      .map(actorToSummary),
    ...core.missions.map(missionToSummary),
    ...core.runs.map(runToSummary),
    ...core.artifacts.map(artifactToSummary),
    ...core.activities.map(activityToSummary),
    ...core.outcomes.map(outcomeToSummary),
    ...core.approvalBindings.map(approvalBindingToSummary),
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

  return {
    objects,
    evidenceAttachments,
    gateDecorators,
    links,
    linksByEndpoint: linkProjection.linksByEndpoint,
    diagnostics: linkProjection.diagnostics,
  };
}

function projectToSummary(p: CoreProjectRecord): WorkGraphObjectSummary {
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
  };
}

function workItemToSummary(w: CoreWorkItemRecord): WorkGraphObjectSummary {
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
  };
}

function taskToSummary(t: CoreTaskRecord): WorkGraphObjectSummary {
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

function missionToSummary(m: MissionRecord): WorkGraphObjectSummary {
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
  };
}

function runToSummary(r: CoreRunRecord): WorkGraphObjectSummary {
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
  };
}

function artifactToSummary(a: CoreArtifactRecord): WorkGraphObjectSummary {
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
  };
}

function activityToSummary(a: CoreActivityRecord): WorkGraphObjectSummary {
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
  };
}

function outcomeToSummary(o: CoreOrchestrationOutcomeRecord): WorkGraphObjectSummary {
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
  };
}

function approvalBindingToSummary(b: CoreApprovalBindingRecord): WorkGraphObjectSummary {
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

