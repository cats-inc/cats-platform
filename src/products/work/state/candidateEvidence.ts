import { createHash } from 'node:crypto';
import path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState } from '../../../core/types.js';
import { upsertCoreArtifact } from '../../../core/model/index.js';
import { inspectCandidateBuild, type CandidateEvidenceRequest, type CandidateBuildEvidence } from '../../../platform/development/candidateEvidence.js';
import { readCollaborationIntent } from './collaborationRecords.js';
import { candidateLifecycleIdentity } from './candidateLifecycle.js';
import { candidateRevisionRef, createCandidateRevisionSet, readCandidateOwnership, type CandidateOwnership,
  type CandidateRevisionRef } from '../../../platform/development/candidateOwnership.js';

export type AttachCandidateRequest = CandidateEvidenceRequest;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const samePath = (left: string, right: string) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right);

function owningRevision(core: CatsCoreState, taskId: string) {
    const intent = readCollaborationIntent(core, taskId);
    const evidence = intent?.implementationEvidence, stage = intent?.stages.implementation;
    const artifact = core.artifacts.find(row => row.id === evidence?.artifactId);
    const run = core.runs.find(row => row.id === stage?.runId);
    const parentTask = core.tasks.find(row => row.id === taskId);
    const implementationTask = core.tasks.find(row => row.id === stage?.taskId);
    if (!intent || intent.ownerActorId !== core.ownerProfile.actorId || !evidence || !stage
      || parentTask?.ownerActorId !== intent.ownerActorId || implementationTask?.ownerActorId !== intent.ownerActorId
      || implementationTask.parentTaskId !== intent.id
      || evidence.runId !== stage.runId || evidence.sessionId !== stage.sessionId || evidence.workspacePath !== stage.workspacePath
      || evidence.validation !== 'runtime_clean_new_head' || artifact?.status !== 'ready'
      || artifact.taskId !== stage.taskId || artifact.runId !== stage.runId || artifact.metadata.source !== 'work-collaboration'
      || artifact.metadata.commitId !== evidence.commitId || artifact.metadata.sessionId !== evidence.sessionId
      || run?.status !== 'completed' || run.taskId !== stage.taskId || run.metadata.collaborationId !== intent.id
      || run.metadata.role !== 'implementation') throw new Error('verified_revision_required');
    return { owner: intent.ownerActorId, evidence, stage, conversationId: intent.conversationId };
}

export async function prepareWorkCandidate(options: {
  coreStore: CoreStore; taskId: string; request: { requestId: string; root: string; companionTaskId?: string };
}) {
  const { coreStore, taskId, request } = options;
  if (!/^[a-zA-Z0-9_-]{8,96}$/u.test(request.requestId) || !path.isAbsolute(request.root)
    || request.root.length > 4096 || (request.companionTaskId !== undefined
      && (typeof request.companionTaskId !== 'string' || !request.companionTaskId
        || request.companionTaskId.length > 256 || request.companionTaskId === taskId))) throw new Error('invalid_candidate_request');
  const root = path.join(await realpath(path.dirname(request.root)), path.basename(request.root));
  const core = await coreStore.readCore(), before = owningRevision(core, taskId);
  const owners = [{ taskId, revision: before }, ...(request.companionTaskId
    ? [{ taskId: request.companionTaskId, revision: owningRevision(core, request.companionTaskId) }] : [])];
  const refs: CandidateRevisionRef[] = [];
  for (const owner of owners) {
    const checkout = await realpath(owner.revision.evidence.workspacePath);
    const manifest = JSON.parse(await readFile(path.join(checkout, 'package.json'), 'utf8')) as { name?: string };
    const member = manifest.name === '@cats-inc/cats-platform' ? 'platform' : manifest.name === '@cats-inc/cats-runtime' ? 'runtime' : null;
    if (!member) throw new Error('cats_member_required');
    const relative = path.relative(checkout, root);
    if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) throw new Error('candidate_source_boundary');
    refs.push({ member, taskId: owner.taskId, runId: owner.revision.stage.runId,
      revisionArtifactId: owner.revision.evidence.artifactId, checkout, commitId: owner.revision.evidence.commitId });
  }
  if (refs.length === 2 && refs[0]!.member === refs[1]!.member) throw new Error('cats_distinct_members_required');
  const primary = refs[0]!;
  const revisionSet = refs.length === 2 ? createCandidateRevisionSet(refs) : undefined;
  const artifactId = `artifact-candidate-${digest({ taskId, requestId: request.requestId }).slice(0, 32)}`;
  const prior = core.artifacts.find(row => row.id === artifactId);
  if (prior) {
    const saved = readCandidateOwnership(prior.metadata.ownership);
    if (prior.metadata.ownerActorId !== before.owner || !samePath(saved.root, root)
      || saved.taskId !== taskId || saved.runId !== before.stage.runId
      || saved.revisionArtifactId !== before.evidence.artifactId || saved.commitId !== before.evidence.commitId
      || digest(candidateRevisionRef(saved)) !== digest(primary)
      || saved.revisionSet?.sha256 !== revisionSet?.sha256) throw new Error('candidate_preparation_conflict');
    const current = await coreStore.readCore();
    for (const owner of owners) if (digest(owningRevision(current, owner.taskId)) !== digest(owner.revision)) throw new Error('candidate_owner_revision_changed');
    return { created: false, artifactId, ownership: saved };
  }
  if (await lstat(root).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw new Error('candidate_new_root_required');
  const ownership = readCandidateOwnership({ schemaVersion: 1, kind: 'cats-desktop-candidate', artifactId,
    ...primary, root, preparedAt: new Date().toISOString(), ...(revisionSet ? { revisionSet } : {}) });
  if (Buffer.byteLength(JSON.stringify(ownership), 'utf8') > 8192) throw new Error('candidate_request_too_large');
  let created = false, result = ownership;
  await coreStore.updateCore(current => {
    for (const owner of owners) if (digest(owningRevision(current, owner.taskId)) !== digest(owner.revision)) throw new Error('candidate_owner_revision_changed');
    const existing = current.artifacts.find(row => row.id === artifactId);
    if (existing) {
      const saved = readCandidateOwnership(existing.metadata.ownership);
      if (existing.metadata.ownerActorId !== before.owner
        || digest({ ...saved, preparedAt: ownership.preparedAt }) !== digest(ownership)) throw new Error('candidate_preparation_conflict');
      result = saved; return current;
    }
    created = true;
    return upsertCoreArtifact(current, { id: artifactId, taskId: before.stage.taskId, runId: before.stage.runId,
      conversationId: before.conversationId, kind: 'build', status: 'draft', path: root,
      title: `Cats Desktop candidate ${ownership.commitId.slice(0, 12)}`,
      summary: revisionSet ? 'Prepared both managed member revisions. Integrated build and validation have not been observed.'
        : 'Prepared ownership record. Build and launch have not been observed.',
      metadata: { source: 'work-candidate-preparation', ownerActorId: before.owner, ownership,
        collaborationId: taskId, revisionArtifactId: before.evidence.artifactId, claim: 'prepared_only' },
    }).core;
  });
  return { artifactId, created, ownership: result };
}

/** Evidence association only: reuses a retained Work revision and never replays execution. */
export async function attachWorkCandidateEvidence(options: {
  coreStore: CoreStore; taskId: string; request: AttachCandidateRequest;
  inspect?: (request: CandidateEvidenceRequest) => Promise<CandidateBuildEvidence>;
}) {
  const { coreStore, taskId, request } = options;
  const baseline = await coreStore.readCore();
  const before = owningRevision(baseline, taskId);
  const observed = await (options.inspect ?? inspectCandidateBuild)(request);
  const ownership = observed.ownership === undefined ? undefined : readCandidateOwnership(observed.ownership);
  const owners = [{ taskId, revision: before }];
  if (ownership?.revisionSet) {
    for (const ref of ownership.revisionSet.members) {
      const revision = ref.taskId === taskId ? before : owningRevision(baseline, ref.taskId);
      if (ref.taskId !== taskId) owners.push({ taskId: ref.taskId, revision });
      if (ref.runId !== revision.stage.runId || ref.revisionArtifactId !== revision.evidence.artifactId
        || ref.commitId !== revision.evidence.commitId || !samePath(ref.checkout, revision.evidence.workspacePath)
        || observed.members[ref.member].head !== ref.commitId
        || !samePath(observed.members[ref.member].checkout, ref.checkout)) throw new Error('candidate_implementation_revision_mismatch');
    }
  }
  const matches = (['platform', 'runtime'] as const).filter(key => observed.members[key].head === before.evidence.commitId
    && samePath(observed.members[key].checkout, before.evidence.workspacePath));
  const memberKey = matches[0];
  if (matches.length !== 1 || !memberKey) {
    throw new Error('candidate_implementation_revision_mismatch');
  }
  const member = observed.members[memberKey];
  const identity = { taskId, runId: before.stage.runId, revisionArtifactId: before.evidence.artifactId,
    root: observed.root, launchId: observed.launchId, instanceId: observed.instanceId, member: memberKey, members: observed.members,
    ...(ownership?.revisionSet ? { revisionSet: ownership.revisionSet } : {}) };
  const id = ownership?.artifactId ?? `artifact-candidate-${digest(identity).slice(0, 32)}`;
  let created = false;
  await coreStore.updateCore(core => {
    for (const owner of owners) if (digest(owningRevision(core, owner.taskId)) !== digest(owner.revision)) throw new Error('candidate_owner_revision_changed');
    const existing = core.artifacts.find(row => row.id === id);
    const controlled = existing && candidateLifecycleIdentity(existing.metadata);
    if (controlled && (controlled.launchId !== observed.launchId || controlled.instanceId !== observed.instanceId
      || controlled.hostPid !== observed.hostPid)) throw new Error('candidate_artifact_conflict');
    if (existing?.status === 'draft' && !ownership) throw new Error('candidate_preparation_conflict');
    if (ownership && (!existing || existing.metadata.ownerActorId !== before.owner
      || digest(readCandidateOwnership(existing.metadata.ownership)) !== digest(ownership)
      || ownership.root !== observed.root || ownership.taskId !== taskId || ownership.runId !== before.stage.runId
      || ownership.revisionArtifactId !== before.evidence.artifactId || ownership.member !== memberKey
      || ownership.commitId !== member.head)) throw new Error('candidate_preparation_conflict');
    if (existing && existing.status !== 'draft') {
      if (existing.metadata.candidateIdentity !== digest(identity)) throw new Error('candidate_artifact_conflict');
      return core;
    }
    created = true;
    return upsertCoreArtifact(core, { id, taskId: before.stage.taskId, runId: before.stage.runId, conversationId: before.conversationId,
      title: `Cats Desktop candidate ${member.head.slice(0, 12)}`, kind: 'build', status: 'ready', path: observed.root,
      summary: 'Candidate source inputs match the recorded implementation commit. Host receipt was inspected. This is build evidence; bug validation and independent approval remain separate.',
      metadata: { source: 'work-candidate', candidateIdentity: digest(identity), revisionArtifactId: before.evidence.artifactId,
        ...(existing?.metadata.candidateLifecycle ? { candidateLifecycle: existing.metadata.candidateLifecycle } : {}),
        ...(ownership ? { ownerActorId: before.owner, ownership } : {}),
        collaborationId: taskId, implementationTaskId: before.stage.taskId, implementationMember: memberKey,
        ...(ownership?.revisionSet ? { revisionSet: ownership.revisionSet, integrationValidation: 'not_observed' }
          : { dependencyMember: memberKey === 'platform' ? 'runtime' : 'platform' }), candidate: observed,
        verification: observed.verification, claim: 'observed_build_evidence' },
    }).core;
  });
  return { artifactId: id, created, path: `/code/artifacts/${encodeURIComponent(id)}` };
}
