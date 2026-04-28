import { buildCoreTaskRecordsView } from './taskRecords.js';
import { applyCoreTaskViewLimit } from './taskViewQuery.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreApprovalBindingRecord,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
} from './types.js';

export type CoreTaskTimelineItemKind =
  | 'task'
  | 'approval_binding'
  | 'run'
  | 'trace'
  | 'checkpoint'
  | 'plan'
  | 'outcome'
  | 'evidence'
  | 'activity';

export type CoreTaskTimelineCategory =
  | 'task_lifecycle'
  | 'governance'
  | 'execution'
  | 'workflow'
  | 'recovery'
  | 'operator';

export const CORE_TASK_TIMELINE_ITEM_KINDS = [
  'task',
  'approval_binding',
  'run',
  'trace',
  'checkpoint',
  'plan',
  'outcome',
  'evidence',
  'activity',
] as const satisfies readonly CoreTaskTimelineItemKind[];

export const CORE_TASK_TIMELINE_CATEGORIES = [
  'task_lifecycle',
  'governance',
  'execution',
  'workflow',
  'recovery',
  'operator',
] as const satisfies readonly CoreTaskTimelineCategory[];

export interface CoreTaskTimelineItem {
  timelineId: string;
  kind: CoreTaskTimelineItemKind;
  category: CoreTaskTimelineCategory;
  recordId: string;
  timestamp: string;
  status: string | null;
  title: string;
  summary: string | null;
  taskId: string;
  conversationId: string | null;
  runId: string | null;
  traceId: string | null;
  actorId: string | null;
}

export interface CoreTaskTimelineCounts {
  total: number;
  taskLifecycle: number;
  governance: number;
  execution: number;
  workflow: number;
  recovery: number;
  operator: number;
}

export interface CoreTaskTimelineView {
  taskId: string;
  conversationId: string | null;
  latestTimestamp: string | null;
  counts: CoreTaskTimelineCounts;
  items: CoreTaskTimelineItem[];
}

export interface CoreTaskTimelineQuery {
  categories?: CoreTaskTimelineCategory[];
  kinds?: CoreTaskTimelineItemKind[];
  actorIds?: string[];
  runIds?: string[];
  limit?: number | null;
}

export interface CoreTaskTimelineQuerySummary {
  totalAvailable: number;
  matching: number;
  returned: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function compareTimelineItems(left: CoreTaskTimelineItem, right: CoreTaskTimelineItem): number {
  const timestampDiff = right.timestamp.localeCompare(left.timestamp);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  const kindRank = (value: CoreTaskTimelineItemKind): number => {
    switch (value) {
      case 'activity':
        return 8;
      case 'evidence':
        return 7;
      case 'outcome':
        return 6;
      case 'plan':
        return 5;
      case 'checkpoint':
        return 4;
      case 'trace':
        return 3;
      case 'run':
        return 2;
      case 'approval_binding':
        return 1;
      case 'task':
      default:
        return 0;
    }
  };

  const rankDiff = kindRank(right.kind) - kindRank(left.kind);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  return right.recordId.localeCompare(left.recordId);
}

function buildTaskTimelineItem(task: CoreTaskRecord): CoreTaskTimelineItem {
  return {
    timelineId: `task:${task.id}`,
    kind: 'task',
    category: 'task_lifecycle',
    recordId: task.id,
    timestamp: task.createdAt,
    status: task.status,
    title: task.title,
    summary: task.summary,
    taskId: task.id,
    conversationId: task.conversationId,
    runId: null,
    traceId: null,
    actorId: task.ownerActorId,
  };
}

function buildApprovalBindingTimelineItem(
  task: CoreTaskRecord,
  binding: CoreApprovalBindingRecord,
): CoreTaskTimelineItem {
  return {
    timelineId: `approval_binding:${binding.id}`,
    kind: 'approval_binding',
    category: 'governance',
    recordId: binding.id,
    timestamp: binding.updatedAt,
    status: binding.kind,
    title: `Approval binding (${binding.kind})`,
    summary: `${binding.subjectKind}:${binding.subjectId}`,
    taskId: task.id,
    conversationId: binding.conversationId ?? task.conversationId,
    runId: null,
    traceId: null,
    actorId: binding.requestedByActorId,
  };
}

function buildRunTimelineItem(task: CoreTaskRecord, run: CoreRunRecord): CoreTaskTimelineItem {
  return {
    timelineId: `run:${run.id}`,
    kind: 'run',
    category: 'execution',
    recordId: run.id,
    timestamp: run.updatedAt,
    status: run.status,
    title: run.title,
    summary: run.summary,
    taskId: task.id,
    conversationId: run.conversationId ?? task.conversationId,
    runId: run.id,
    traceId: run.traceId,
    actorId: null,
  };
}

function buildTraceTimelineItem(task: CoreTaskRecord, trace: CoreTraceRecord): CoreTaskTimelineItem {
  return {
    timelineId: `trace:${trace.id}`,
    kind: 'trace',
    category: 'workflow',
    recordId: trace.id,
    timestamp: trace.createdAt,
    status: trace.kind,
    title: `Trace (${trace.kind})`,
    summary: trace.message,
    taskId: task.id,
    conversationId: trace.conversationId ?? task.conversationId,
    runId: trace.runId,
    traceId: trace.traceId,
    actorId: trace.actorId,
  };
}

function buildCheckpointTimelineItem(
  task: CoreTaskRecord,
  checkpoint: CoreCheckpointRecord,
): CoreTaskTimelineItem {
  return {
    timelineId: `checkpoint:${checkpoint.id}`,
    kind: 'checkpoint',
    category: 'workflow',
    recordId: checkpoint.id,
    timestamp: checkpoint.updatedAt,
    status: checkpoint.status,
    title: `Checkpoint: ${checkpoint.label}`,
    summary: checkpoint.summary,
    taskId: task.id,
    conversationId: checkpoint.conversationId ?? task.conversationId,
    runId: checkpoint.runId,
    traceId: checkpoint.sourceTraceId,
    actorId: null,
  };
}

function buildOutcomeTimelineItem(
  task: CoreTaskRecord,
  outcome: CoreOrchestrationOutcomeRecord,
): CoreTaskTimelineItem {
  return {
    timelineId: `outcome:${outcome.id}`,
    kind: 'outcome',
    category: 'execution',
    recordId: outcome.id,
    timestamp: outcome.updatedAt,
    status: outcome.status,
    title: outcome.title,
    summary: outcome.summary,
    taskId: task.id,
    conversationId: outcome.conversationId ?? task.conversationId,
    runId: outcome.runId,
    traceId: null,
    actorId: null,
  };
}

function readActivityCategory(activity: CoreActivityRecord): CoreTaskTimelineCategory {
  const metadata = asRecord(activity.metadata);
  if (readString(metadata?.replayPhase) || readString(metadata?.source)?.startsWith('orchestrator-')) {
    return 'recovery';
  }

  switch (activity.kind) {
    case 'approval_requested':
    case 'approval_decided':
      return 'governance';
    case 'operator_action':
      return 'operator';
    case 'checkpoint_recorded':
      return 'workflow';
    case 'artifact_recorded':
      return 'execution';
    case 'status_change':
    case 'work_item_updated':
    case 'note':
    default:
      return 'task_lifecycle';
  }
}

function buildActivityTitle(activity: CoreActivityRecord): string {
  switch (activity.kind) {
    case 'approval_requested':
      return 'Approval requested';
    case 'approval_decided':
      return 'Approval decided';
    case 'operator_action':
      return 'Operator action';
    case 'artifact_recorded':
      return 'Artifact recorded';
    case 'checkpoint_recorded':
      return 'Checkpoint recorded';
    case 'work_item_updated':
      return 'Work item updated';
    case 'status_change':
      return 'Status changed';
    case 'note':
    default:
      return 'Note';
  }
}

function buildActivityTimelineItem(
  task: CoreTaskRecord,
  activity: CoreActivityRecord,
): CoreTaskTimelineItem {
  return {
    timelineId: `activity:${activity.id}`,
    kind: 'activity',
    category: readActivityCategory(activity),
    recordId: activity.id,
    timestamp: activity.createdAt,
    status: activity.kind,
    title: buildActivityTitle(activity),
    summary: activity.message,
    taskId: task.id,
    conversationId: activity.conversationId ?? task.conversationId,
    runId: activity.runId,
    traceId: null,
    actorId: activity.actorId,
  };
}

function buildCounts(items: CoreTaskTimelineItem[]): CoreTaskTimelineCounts {
  return {
    total: items.length,
    taskLifecycle: items.filter((item) => item.category === 'task_lifecycle').length,
    governance: items.filter((item) => item.category === 'governance').length,
    execution: items.filter((item) => item.category === 'execution').length,
    workflow: items.filter((item) => item.category === 'workflow').length,
    recovery: items.filter((item) => item.category === 'recovery').length,
    operator: items.filter((item) => item.category === 'operator').length,
  };
}

export function buildCoreTaskTimelineView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskTimelineView {
  const records = buildCoreTaskRecordsView(core, task);
  const items = [
    buildTaskTimelineItem(task),
    ...records.approvalBindings.map((binding) => buildApprovalBindingTimelineItem(task, binding)),
    ...records.runs.map((run) => buildRunTimelineItem(task, run)),
    ...records.traces.map((trace) => buildTraceTimelineItem(task, trace)),
    ...records.checkpoints.map((checkpoint) => buildCheckpointTimelineItem(task, checkpoint)),
    ...records.outcomes.map((outcome) => buildOutcomeTimelineItem(task, outcome)),
    ...records.activities.map((activity) => buildActivityTimelineItem(task, activity)),
  ].sort(compareTimelineItems);

  return {
    taskId: task.id,
    conversationId: task.conversationId,
    latestTimestamp: items[0]?.timestamp ?? null,
    counts: buildCounts(items),
    items,
  };
}

function matchesTimelineQuery(
  item: CoreTaskTimelineItem,
  query: CoreTaskTimelineQuery,
): boolean {
  if (query.categories?.length && !query.categories.includes(item.category)) {
    return false;
  }

  if (query.kinds?.length && !query.kinds.includes(item.kind)) {
    return false;
  }

  if (query.actorIds?.length && !query.actorIds.includes(item.actorId ?? '')) {
    return false;
  }

  if (query.runIds?.length && !query.runIds.includes(item.runId ?? '')) {
    return false;
  }

  return true;
}

export function queryCoreTaskTimelineView(
  core: CatsCoreState,
  task: CoreTaskRecord,
  query: CoreTaskTimelineQuery = {},
): {
  timeline: CoreTaskTimelineView;
  summary: CoreTaskTimelineQuerySummary;
} {
  const fullTimeline = buildCoreTaskTimelineView(core, task);
  const matching = fullTimeline.items.filter((item) => matchesTimelineQuery(item, query));
  const returned = applyCoreTaskViewLimit(matching, query.limit);

  return {
    timeline: {
      taskId: fullTimeline.taskId,
      conversationId: fullTimeline.conversationId,
      latestTimestamp: returned[0]?.timestamp ?? null,
      counts: buildCounts(returned),
      items: returned,
    },
    summary: {
      totalAvailable: fullTimeline.items.length,
      matching: matching.length,
      returned: returned.length,
    },
  };
}
