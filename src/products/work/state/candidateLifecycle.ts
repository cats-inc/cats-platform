import { createHash } from 'node:crypto';
import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreArtifactRecord } from '../../../core/types.js';
import type { CandidateBuildEvidence } from '../../../platform/development/candidateEvidence.js';
import type { CandidateReviewReceipt, CandidateReviewRequest, CandidateReviewTarget } from '../shared/candidateReview.js';
import { upsertCoreArtifact } from '../../../core/model/index.js';
import { candidateRevisionRef, readCandidateOwnership } from '../../../platform/development/candidateOwnership.js';
import { operateOwnedCandidate, type CandidateLifecycleObservation } from '../../../platform/development/candidateLifecycle.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Identity = Pick<CandidateLifecycleObservation, 'launchId' | 'instanceId' | 'hostPid'>;
function identity(value: unknown): Identity | undefined {
  if (value === undefined) return undefined;
  const row = value as Identity;
  if (!row || typeof row !== 'object' || typeof row.launchId !== 'string' || !/^[a-f0-9]{64}$/u.test(row.launchId)
    || typeof row.instanceId !== 'string' || !/^[a-f0-9]{32}$/u.test(row.instanceId) || !Number.isSafeInteger(row.hostPid) || row.hostPid < 1) {
    throw new Error('candidate_invalid_identity');
  }
  return { launchId: row.launchId, instanceId: row.instanceId, hostPid: row.hostPid };
}
function readObservation(value: unknown): CandidateLifecycleObservation | undefined {
  const ref = identity(value); if (!ref) return undefined;
  const row = value as CandidateLifecycleObservation;
  if (!['running', 'stopping', 'drained', 'failed', 'unconfirmed'].includes(row.state)
    || typeof row.instanceBoundStop !== 'boolean' || typeof row.observedAt !== 'string' || !Number.isFinite(Date.parse(row.observedAt))
    || (row.stopRequestedAt !== undefined && (typeof row.stopRequestedAt !== 'string' || !Number.isFinite(Date.parse(row.stopRequestedAt))))) {
    throw new Error('candidate_invalid_observation');
  }
  return { ...ref, state: row.state, instanceBoundStop: row.instanceBoundStop, observedAt: row.observedAt,
    ...(row.stopRequestedAt ? { stopRequestedAt: row.stopRequestedAt } : {}) };
}
export function candidateLifecycleIdentity(metadata: Record<string, unknown>): Identity | undefined {
  const lifecycle = identity(readObservation(metadata.candidateLifecycle)), attached = identity(metadata.candidate);
  if (lifecycle && attached && digest(lifecycle) !== digest(attached)) throw new Error('candidate_identity_mismatch');
  return lifecycle ?? attached;
}
function ownedCandidate(core: CatsCoreState, taskId: string, artifactId: string) {
  const artifact = core.artifacts.find(row => row.id === artifactId);
  if (!artifact || artifact.kind !== 'build' || !['draft', 'ready'].includes(artifact.status)
    || !['work-candidate-preparation', 'work-candidate'].includes(String(artifact.metadata.source))
    || artifact.metadata.ownerActorId !== core.ownerProfile.actorId) throw new Error('candidate_owner_changed');
  const ownership = readCandidateOwnership(artifact.metadata.ownership);
  if (ownership.taskId !== taskId || ownership.artifactId !== artifact.id || ownership.runId !== artifact.runId
    || ownership.root !== artifact.path) throw new Error('candidate_identity_mismatch');
  for (const ref of ownership.revisionSet?.members ?? [candidateRevisionRef(ownership)]) {
    const task = core.tasks.find(row => row.id === ref.taskId);
    const run = core.runs.find(row => row.id === ref.runId);
    const implementation = core.tasks.find(row => row.id === run?.taskId);
    const revision = core.artifacts.find(row => row.id === ref.revisionArtifactId);
    if (task?.ownerActorId !== core.ownerProfile.actorId || implementation?.ownerActorId !== core.ownerProfile.actorId
      || implementation.parentTaskId !== task.id || run?.metadata.collaborationId !== task.id
      || run.metadata.role !== 'implementation' || revision?.runId !== run.id || revision.taskId !== implementation.id
      || revision.metadata.source !== 'work-collaboration' || revision.metadata.commitId !== ref.commitId
      || (ref.taskId === ownership.taskId && artifact.taskId !== implementation.id)) throw new Error('candidate_owner_changed');
  }
  return { artifact, ownership, expected: candidateLifecycleIdentity(artifact.metadata) };
}
export async function listWorkCandidates(coreStore: CoreStore, taskId: string) {
  const core = await coreStore.readCore();
  if (core.tasks.find(task => task.id === taskId)?.ownerActorId !== core.ownerProfile.actorId) throw new Error('candidate_owner_changed');
  const candidates = [];
  for (const row of core.artifacts) {
    if ((row.metadata.ownership as { taskId?: string } | undefined)?.taskId !== taskId) continue;
    try {
      const { artifact, ownership } = ownedCandidate(core, taskId, row.id);
      const last = readObservation(artifact.metadata.candidateLifecycle);
      let reviewTarget: CandidateReviewTarget | undefined, lastReview: CandidateReviewReceipt | undefined;
      try {
        const selected = candidateReviewBinding(core, taskId, artifact.id);
        reviewTarget = selected.target;
        const reports = core.artifacts.filter(report => report.metadata.source === 'work-candidate-review'
          && report.metadata.candidateArtifactId === artifact.id && report.metadata.bindingDigest === reviewTarget!.bindingDigest);
        const reviews = reports.reverse().flatMap(report => {
          try { return [readCandidateReview(report, selected)]; } catch { return []; }
        });
        lastReview = reviews.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
      } catch { /* Only complete attached build evidence can receive a review. */ }
      candidates.push({ artifactId: artifact.id, root: ownership.root, ...(last ? { observation: last } : {}),
        ...(reviewTarget ? { reviewTarget } : {}), ...(lastReview ? { lastReview } : {}) });
    } catch { /* A foreign or malformed record cannot authorize a control. */ }
  }
  return { candidates };
}

function candidateReviewBinding(core: CatsCoreState, taskId: string, artifactId: string) {
  const owned = ownedCandidate(core, taskId, artifactId), { artifact, ownership, expected } = owned;
  const observed = artifact.metadata.candidate as CandidateBuildEvidence | undefined;
  if (artifact.status !== 'ready' || artifact.metadata.source !== 'work-candidate'
    || artifact.metadata.claim !== 'observed_build_evidence' || !observed || !expected
    || observed.verification !== 'commit_inputs_and_host_receipt' || observed.root !== ownership.root
    || observed.launchId !== expected.launchId || observed.instanceId !== expected.instanceId || observed.hostPid !== expected.hostPid) {
    throw new Error('candidate_review_requires_build');
  }
  const members = (['platform', 'runtime'] as const).map(member => {
    const source = observed.members?.[member];
    if (!source || !/^[a-f0-9]{40,64}$/u.test(source.head) || !/^[a-f0-9]{64}$/u.test(source.sourceDigest)) throw new Error('candidate_review_requires_build');
    return { member, commitId: source.head };
  });
  const candidateIdentity = digest({ taskId, runId: ownership.runId, revisionArtifactId: ownership.revisionArtifactId,
    root: observed.root, launchId: observed.launchId, instanceId: observed.instanceId, member: ownership.member,
    members: observed.members, ...(ownership.revisionSet ? { revisionSet: ownership.revisionSet } : {}) });
  if (candidateIdentity !== artifact.metadata.candidateIdentity) throw new Error('candidate_review_binding_changed');
  const binding = { ownerActorId: core.ownerProfile.actorId, candidateIdentity, ownership, generation: expected, members: observed.members };
  return { ...owned, binding, target: { bindingDigest: digest(binding), members } satisfies CandidateReviewTarget };
}

function reviewContentDigest(request: CandidateReviewRequest, reviewerActorId: string) {
  return digest({ artifactId: request.artifactId, requestId: request.requestId, bindingDigest: request.bindingDigest,
    verdict: request.verdict, checks: request.checks, reviewerActorId });
}
const validChecks = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && Buffer.byteLength(value, 'utf8') <= 6000;
function readCandidateReview(report: CoreArtifactRecord, selected: ReturnType<typeof candidateReviewBinding>): CandidateReviewReceipt {
  const metadata = report.metadata, value = metadata.review as CandidateReviewReceipt | undefined;
  if (report.kind !== 'report' || report.status !== 'ready' || report.taskId !== selected.artifact.taskId
    || report.runId !== selected.artifact.runId || report.conversationId !== selected.artifact.conversationId
    || metadata.source !== 'work-candidate-review' || metadata.claim !== 'manual_operator_attestation'
    || metadata.candidateArtifactId !== selected.artifact.id || metadata.bindingDigest !== selected.target.bindingDigest
    || digest(metadata.binding) !== selected.target.bindingDigest
    || typeof metadata.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/u.test(metadata.requestId)
    || !value || typeof value !== 'object' || Array.isArray(value) || value.artifactId !== report.id
    || value.bindingDigest !== selected.target.bindingDigest || typeof value.reviewerActorId !== 'string'
    || !value.reviewerActorId.trim() || value.reviewerActorId.length > 256 || typeof value.reviewedAt !== 'string' || value.reviewedAt.length > 32
    || !Number.isFinite(Date.parse(value.reviewedAt)) || value.reviewedAt !== report.createdAt
    || !['accepted', 'changes_requested'].includes(value.verdict) || !validChecks(value.checks)) throw new Error('candidate_review_invalid_record');
  const request = { artifactId: selected.artifact.id, requestId: metadata.requestId, bindingDigest: value.bindingDigest,
    verdict: value.verdict, checks: value.checks };
  if (report.id !== 'artifact-candidate-review-' + digest({ candidate: request.artifactId, reviewerActorId: value.reviewerActorId,
    requestId: request.requestId }).slice(0, 32) || metadata.contentDigest !== reviewContentDigest(request, value.reviewerActorId)) {
    throw new Error('candidate_review_invalid_record');
  }
  return { artifactId: value.artifactId, bindingDigest: value.bindingDigest, reviewerActorId: value.reviewerActorId,
    reviewedAt: value.reviewedAt, verdict: value.verdict, checks: value.checks };
}

/** Records the authenticated operator's plain-text attestation; does not evaluate or approve execution. */
export async function recordWorkCandidateReview(options: {
  coreStore: CoreStore; taskId: string; reviewerActorId: string; request: CandidateReviewRequest;
}) {
  const { coreStore, taskId, reviewerActorId, request } = options;
  if (!reviewerActorId.trim() || reviewerActorId.length > 256 || !request || typeof request !== 'object' || Array.isArray(request)
    || Object.keys(request).length !== 5 || Object.keys(request).some(key => !['artifactId', 'requestId', 'bindingDigest', 'verdict', 'checks'].includes(key))
    || typeof request.artifactId !== 'string' || !request.artifactId || request.artifactId.length > 256
    || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/u.test(request.requestId)
    || typeof request.bindingDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(request.bindingDigest)
    || !['accepted', 'changes_requested'].includes(request.verdict) || !validChecks(request.checks)) throw new Error('invalid_candidate_review');
  const id = 'artifact-candidate-review-' + digest({ candidate: request.artifactId, reviewerActorId, requestId: request.requestId }).slice(0, 32);
  const contentDigest = reviewContentDigest(request, reviewerActorId);
  let created = false, review: CandidateReviewReceipt | undefined;
  await coreStore.updateCore(core => {
    const selected = candidateReviewBinding(core, taskId, request.artifactId), { artifact, binding, target } = selected;
    if (target.bindingDigest !== request.bindingDigest) throw new Error('candidate_review_binding_changed');
    const existing = core.artifacts.find(row => row.id === id);
    if (existing) {
      if (existing.metadata.source !== 'work-candidate-review' || existing.metadata.contentDigest !== contentDigest) throw new Error('candidate_review_conflict');
      review = readCandidateReview(existing, selected);
      return core;
    }
    created = true;
    review = { artifactId: id, bindingDigest: target.bindingDigest, reviewerActorId,
      reviewedAt: new Date().toISOString(), verdict: request.verdict, checks: request.checks };
    return upsertCoreArtifact(core, { id, taskId: artifact.taskId, runId: artifact.runId, conversationId: artifact.conversationId,
      kind: 'report', status: 'ready', title: 'Candidate manual review', summary: request.checks, createdAt: review.reviewedAt,
      metadata: { source: 'work-candidate-review', claim: 'manual_operator_attestation', candidateArtifactId: artifact.id,
        bindingDigest: target.bindingDigest, binding, requestId: request.requestId, contentDigest, review } }).core;
  });
  return { created, review: review! };
}

/** Uses historical ownership, so cancelled tasks or removed source checkouts can still drain. */
export async function controlWorkCandidate(options: {
  coreStore: CoreStore; taskId: string; artifactId: string; action: 'status' | 'stop';
  existingOnly?: boolean; stopOnce?: boolean;
  selection?: { ownershipDigest: string; identity: Identity };
  operate?: typeof operateOwnedCandidate;
}) {
  const { coreStore, taskId, artifactId } = options;
  const initial = ownedCandidate(await coreStore.readCore(), taskId, artifactId);
  if (options.selection && (digest(initial.ownership) !== options.selection.ownershipDigest
    || digest(initial.expected) !== digest(options.selection.identity))) throw new Error('candidate_selection_changed');
  if (options.existingOnly && !initial.expected) throw new Error('candidate_binding_required');
  let stopAdmitted = false;
  const save = async (observation: CandidateLifecycleObservation, requestingStop = false) => {
    let saved = observation;
    await coreStore.updateCore(core => {
      const current = ownedCandidate(core, taskId, artifactId);
      if ((options.selection || options.existingOnly) && (!current.expected
        || digest(current.expected) !== digest(options.selection?.identity ?? initial.expected))) throw new Error('candidate_binding_changed');
      if (digest(current.ownership) !== digest(initial.ownership)
        || (current.expected && digest(current.expected) !== digest(identity(observation)))) throw new Error('candidate_owner_changed');
      const prior = readObservation(current.artifact.metadata.candidateLifecycle);
      if (requestingStop && options.stopOnce && (prior?.stopRequestedAt || (prior && ['drained', 'failed'].includes(prior.state)))) {
        saved = prior; return core;
      }
      if (requestingStop) stopAdmitted = true;
      const stopRequestedAt = prior?.stopRequestedAt ?? (requestingStop ? new Date().toISOString() : undefined);
      saved = { ...observation, ...(stopRequestedAt ? { stopRequestedAt } : {}) };
      if (prior && ['drained', 'failed'].includes(prior.state)) saved = prior;
      else if (stopRequestedAt && saved.state === 'running') saved.state = 'unconfirmed';
      return upsertCoreArtifact(core, { ...current.artifact,
        metadata: { ...current.artifact.metadata, candidateLifecycle: saved } }).core;
    });
    return saved;
  };
  const observed = await (options.operate ?? operateOwnedCandidate)({ ownership: initial.ownership,
    expected: initial.expected, action: options.action,
    beforeStop: async observed => { await save({ ...observed, state: 'unconfirmed' }, true); return stopAdmitted; },
  });
  return { artifactId, observation: await save(observed) };
}

export interface CandidateCancellationSummary { drained: number; failed: number; pending: number; unbound: number }
/** Explicit cancellation may stop a bound generation; recovery is observation-only. */
export async function reconcileWorkCandidates(options: {
  coreStore: CoreStore; mode: 'cancel' | 'observe'; taskIds?: readonly string[]; runIds?: readonly string[];
}): Promise<CandidateCancellationSummary | undefined> {
  const { coreStore } = options;
  const snapshot = await coreStore.readCore(), selected = options.taskIds && new Set(options.taskIds);
  const selectedRuns = options.runIds && new Set(options.runIds);
  const summary = { drained: 0, failed: 0, pending: 0, unbound: 0 };
  for (const artifact of snapshot.artifacts) {
    if (!artifact.metadata.ownership || !['work-candidate-preparation', 'work-candidate'].includes(String(artifact.metadata.source))) continue;
    let ownership;
    try { ownership = readCandidateOwnership(artifact.metadata.ownership); } catch { continue; }
    const refs = ownership.revisionSet?.members ?? [candidateRevisionRef(ownership)];
    if ((selected || selectedRuns) && !refs.some(ref => selected?.has(ref.taskId) || selectedRuns?.has(ref.runId))) continue;
    let expected: Identity | undefined;
    try {
      expected = candidateLifecycleIdentity(artifact.metadata);
      if (!expected) { summary.unbound++; continue; }
      const owned = ownedCandidate(await coreStore.readCore(), ownership.taskId, artifact.id);
      if (digest(owned.ownership) !== digest(ownership) || digest(owned.expected) !== digest(expected)) throw new Error('candidate_selection_changed');
      const prior = readObservation(owned.artifact.metadata.candidateLifecycle);
      if (prior && ['drained', 'failed'].includes(prior.state)) { summary[prior.state === 'drained' ? 'drained' : 'failed']++; continue; }
      const result = await controlWorkCandidate({ coreStore, taskId: ownership.taskId, artifactId: artifact.id,
        action: options.mode === 'cancel' && !prior?.stopRequestedAt ? 'stop' : 'status', existingOnly: true, stopOnce: true,
        selection: { ownershipDigest: digest(ownership), identity: expected } });
      const state = result.observation.state;
      summary[state === 'drained' ? 'drained' : state === 'failed' ? 'failed' : 'pending']++;
    } catch {
      summary.pending++;
      // Preserve a bounded unknown result without changing a foreign or replaced record.
      await coreStore.updateCore(core => {
        const current = ownedCandidate(core, ownership.taskId, artifact.id);
        if (!expected || digest(current.expected) !== digest(expected) || digest(current.ownership) !== digest(ownership)) return core;
        const prior = readObservation(current.artifact.metadata.candidateLifecycle);
        if (prior && ['drained', 'failed'].includes(prior.state)) return core;
        return upsertCoreArtifact(core, { ...current.artifact, metadata: { ...current.artifact.metadata,
          candidateLifecycle: { ...current.expected, ...prior, state: 'unconfirmed', observedAt: new Date().toISOString(),
            instanceBoundStop: prior?.instanceBoundStop ?? false } } }).core;
      }).catch(() => undefined);
    }
  }
  return Object.values(summary).some(Boolean) ? summary : undefined;
}
