import { createHash } from 'node:crypto';
import type { CatsCoreState } from '../../../core/types.js';
import { CoreConflictError, CoreNotFoundError, CoreValidationError } from '../../../core/errors.js';
import { emptyOwnerLifecycle, ownerEntry, ownerSubjectKey, setOwnerEntry, type OwnerCleanupReceipt } from '../../../core/ownerLifecycle.js';
import { getOwnerRecord, ownerRecordDependencies, type ManagedRecord } from '../../../core/ownerManagement.js';
import { applyOwnerLifecycleProjection } from '../../../core/ownerLifecycleProjection.js';

export interface HistorySubject { family: 'run' | 'mission'; id: string }
export interface HistoryRequest { subjects: HistorySubject[]; scope: 'logs' | 'history' }
export interface HistoryPreview extends HistoryRequest {
  token: string;
  items: Array<HistorySubject & { title: string; outcome: 'compacted' | 'removed' | 'retained' | 'blocked'; reasons: string[] }>;
  detailRecords: number;
  estimatedBytes: null;
  retainedResources: string[];
}

export function isTerminalHistory(record: { status: string }): boolean {
  return ['completed', 'failed', 'cancelled'].includes(record.status);
}

export function executionSource(record: ManagedRecord): 'room' | 'work' | 'schedule' | 'delegation' | 'unknown' {
  const metadata = record.metadata;
  if (metadata.trigger && typeof metadata.trigger === 'object' && typeof (metadata.trigger as Record<string, unknown>).ruleId === 'string'
    || metadata.scheduleRuleId || metadata.originSurface === 'schedule' || metadata.source === 'schedule') return 'schedule';
  if (metadata.source === 'chat-room-workflow') return 'room';
  if (metadata.collaborationIntentId || metadata.source === 'delegation') return 'delegation';
  if (metadata.supervision || metadata.source === 'work-supervised-run' || metadata.source === 'transport-work') return 'work';
  return 'unknown';
}

export function validateHistoryRequest(input: unknown): HistoryRequest {
  if (!input || typeof input !== 'object') throw new CoreValidationError('Select execution history and a cleanup scope.');
  const request = input as HistoryRequest;
  if (!['logs', 'history'].includes(request.scope) || !Array.isArray(request.subjects) || request.subjects.length < 1 || request.subjects.length > 100) {
    throw new CoreValidationError('Select between 1 and 100 attempts and a valid scope.');
  }
  const keys = new Set<string>();
  const subjects: HistorySubject[] = [];
  for (const subject of request.subjects) {
    if (!subject || !['run', 'mission'].includes(subject.family) || typeof subject.id !== 'string' || !subject.id.trim()) throw new CoreValidationError('Invalid history selection.');
    const key = ownerSubjectKey(subject.family, subject.id);
    if (!keys.has(key)) { subjects.push({ family: subject.family, id: subject.id }); keys.add(key); }
  }
  return { subjects: subjects.sort((a, b) => ownerSubjectKey(a.family, a.id).localeCompare(ownerSubjectKey(b.family, b.id))), scope: request.scope };
}

function expandSelection(core: CatsCoreState, request: HistoryRequest): HistorySubject[] {
  const subjects = [...request.subjects];
  const keys = new Set(subjects.map(subject => ownerSubjectKey(subject.family, subject.id)));
  const add = (subject: HistorySubject) => { const key = ownerSubjectKey(subject.family, subject.id); if (!keys.has(key)) { subjects.push(subject); keys.add(key); } };
  for (let index = 0; index < subjects.length; index++) {
    const subject = subjects[index];
    if (!getOwnerRecord(core, subject.family, subject.id)) throw new CoreNotFoundError('An attempt no longer exists. Refresh the selection.');
    if (subject.family === 'run') {
      for (const run of core.runs) if (run.parentRunId === subject.id) add({ family: 'run', id: run.id });
      for (const mission of core.missions) if (mission.metadata.runId === subject.id) add({ family: 'mission', id: mission.id });
    } else {
      for (const run of core.runs) if (run.metadata.missionId === subject.id) add({ family: 'run', id: run.id });
    }
    if (subjects.length > 100) throw new CoreValidationError('This attempt tree exceeds 100 items. Select a smaller branch.');
  }
  return subjects.sort((a, b) => ownerSubjectKey(a.family, a.id).localeCompare(ownerSubjectKey(b.family, b.id)));
}

function containsReference(value: unknown, id: string, depth = 0): boolean {
  if (depth > 20 || !value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => (/ids?$/i.test(key) && (child === id || Array.isArray(child) && child.includes(id))) || containsReference(child, id, depth + 1));
}

export function previewHistory(core: CatsCoreState, input: unknown): HistoryPreview {
  const request = validateHistoryRequest(input);
  const subjects = expandSelection(core, request);
  const keys = new Set(subjects.map(subject => ownerSubjectKey(subject.family, subject.id)));
  const runs = new Set(subjects.filter(subject => subject.family === 'run').map(subject => subject.id));
  const groupHasActive = subjects.some(subject => !isTerminalHistory(getOwnerRecord(core, subject.family, subject.id)!));
  const protectedReasons: string[] = [];
  for (const subject of subjects) {
    const record = getOwnerRecord(core, subject.family, subject.id)!;
    for (const dependency of ownerRecordDependencies(core, subject.family, subject.id)) {
      if (!['trace', 'checkpoint', 'outcome', 'activity'].includes(dependency.family) && !keys.has(`${dependency.family}:${dependency.id}`)) protectedReasons.push(`${dependency.family}: ${dependency.title}`);
    }
    for (const [family, records] of Object.entries({ task: core.tasks, work_item: core.workItems, run: core.runs, mission: core.missions, artifact: core.artifacts, approval: core.approvalBindings })) {
      for (const referring of records) if (!keys.has(`${family}:${referring.id}`) && containsReference(referring.metadata, subject.id)) protectedReasons.push(`${family}: ${referring.id}`);
    }
    if (executionSource(record) === 'schedule') protectedReasons.push('Schedule execution provenance is retained for rule/receipt history.');
  }
  const openCheckpoint = core.checkpoints.some(checkpoint => checkpoint.runId && runs.has(checkpoint.runId) && checkpoint.status === 'open');
  const sharedParent = subjects.some(subject => subject.family === 'mission' && (() => {
    const mission = core.missions.find(mission => mission.id === subject.id)!;
    return mission.metadata.source === 'chat-room-workflow' && typeof mission.metadata.runId === 'string' && !runs.has(mission.metadata.runId);
  })());
  const cannotClear = groupHasActive || openCheckpoint;
  const retained = protectedReasons.length > 0;
  const items = subjects.map(subject => {
    const record = getOwnerRecord(core, subject.family, subject.id)!;
    const reasons = cannotClear ? [openCheckpoint ? 'An open checkpoint still needs its evidence.' : 'The selected attempt tree includes active work. Stop it before cleanup.']
      : sharedParent ? ['Mission detail is shared with its parent attempt. Open the parent Run to preview cleanup of the complete attempt.']
      : request.scope === 'history' && retained ? [...new Set(protectedReasons)] : [];
    const outcome = cannotClear ? 'blocked' as const : sharedParent || request.scope === 'history' && retained ? 'retained' as const : request.scope === 'history' ? 'removed' as const : 'compacted' as const;
    return { ...subject, title: record.title, outcome, reasons };
  });
  const fingerprint = { subjects, scope: request.scope, revision: core.ownerLifecycle?.revision ?? 0,
    runs: core.runs, missions: core.missions, tasks: core.tasks, workItems: core.workItems, artifacts: core.artifacts,
    approvals: core.approvalBindings, links: core.workGraphLinks, checkpoints: core.checkpoints, traces: core.traces, activities: core.activities, sessions: core.sessions, outcomes: core.outcomes };
  return { subjects, scope: request.scope, token: createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex'), items,
    detailRecords: core.traces.filter(trace => trace.runId && runs.has(trace.runId)).length + core.activities.filter(activity => activity.runId && runs.has(activity.runId)).length,
    estimatedBytes: null, retainedResources: ['Conversation messages, deliverable files, provider-native transcripts and external evidence files are kept.'] };
}

export function applyHistory(core: CatsCoreState, input: unknown): { core: CatsCoreState; receipt: OwnerCleanupReceipt } {
  const request = validateHistoryRequest(input);
  const token = (input as { token?: unknown }).token;
  if (typeof token !== 'string') throw new CoreValidationError('A cleanup preview is required.');
  const keys = request.subjects.map(subject => ownerSubjectKey(subject.family, subject.id));
  const previous = core.ownerLifecycle?.receipts.find(receipt => receipt.id === token && receipt.scope === request.scope && JSON.stringify(receipt.subjectKeys) === JSON.stringify(keys));
  if (previous) return { core, receipt: previous };
  const preview = previewHistory(core, request);
  if (token !== preview.token) throw new CoreConflictError('History or its references changed. Preview cleanup again.', 'owner_preview_stale');
  const now = new Date().toISOString();
  let next = core;
  for (const item of preview.items) {
    if (item.outcome === 'blocked' || item.outcome === 'retained' && !preview.subjects.some(subject => subject.family === 'run')) continue;
    next = setOwnerEntry(next, item.family, item.id, { logsClearedAt: now, ...(item.outcome === 'removed' ? { deleted: true, listing: 'removed', pinned: false } : {}) }, now);
  }
  next = applyOwnerLifecycleProjection(next);
  const receipt: OwnerCleanupReceipt = { id: token, scope: request.scope, subjectKeys: preview.subjects.map(subject => ownerSubjectKey(subject.family, subject.id)), completedAt: now,
    results: preview.items.map(item => ({ key: ownerSubjectKey(item.family, item.id), status: item.outcome, ...(item.reasons.length ? { reason: item.reasons.join('; ') } : {}) })) };
  const lifecycle = structuredClone(next.ownerLifecycle ?? emptyOwnerLifecycle());
  lifecycle.receipts = [receipt, ...lifecycle.receipts.filter(item => item.id !== token)].slice(0, 100);
  lifecycle.revision += 1;
  return { core: { ...next, ownerLifecycle: lifecycle }, receipt };
}

export function exportHistory(core: CatsCoreState, input: unknown): unknown {
  const preview = previewHistory(core, input);
  const runIds = new Set(preview.subjects.filter(subject => subject.family === 'run').map(subject => subject.id));
  return { exportedAt: new Date().toISOString(), scope: preview.scope,
    attempts: preview.subjects.map(subject => { const record = getOwnerRecord(core, subject.family, subject.id)!; return { ...subject, title: record.title, status: record.status, summary: record.summary, updatedAt: record.updatedAt }; }),
    traces: core.traces.filter(trace => trace.runId && runIds.has(trace.runId)).map(trace => ({ id: trace.id, runId: trace.runId, kind: trace.kind, message: trace.message, createdAt: trace.createdAt })) };
}
