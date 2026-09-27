import { createHash } from 'node:crypto';
import path from 'node:path';
import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState } from '../../../core/types.js';
import { upsertCoreArtifact } from '../../../core/model/index.js';
import { inspectCandidateBuild, type CandidateEvidenceRequest, type CandidateBuildEvidence } from '../../../platform/development/candidateEvidence.js';
import { readCollaborationIntent } from './collaborationRecords.js';

export type AttachCandidateRequest = CandidateEvidenceRequest;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const samePath = (left: string, right: string) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right);

/** Evidence association only: reuses a retained Work revision and never replays execution. */
export async function attachWorkCandidateEvidence(options: {
  coreStore: CoreStore; taskId: string; request: AttachCandidateRequest;
  inspect?: (request: CandidateEvidenceRequest) => Promise<CandidateBuildEvidence>;
}) {
  const { coreStore, taskId, request } = options;
  const owningRevision = (core: CatsCoreState) => {
    const intent = readCollaborationIntent(core, taskId);
    const evidence = intent?.implementationEvidence, stage = intent?.stages.implementation;
    const artifact = core.artifacts.find(row => row.id === evidence?.artifactId);
    const run = core.runs.find(row => row.id === stage?.runId);
    if (!intent || intent.ownerActorId !== core.ownerProfile.actorId || !evidence || !stage
      || evidence.runId !== stage.runId || evidence.sessionId !== stage.sessionId || evidence.workspacePath !== stage.workspacePath
      || evidence.validation !== 'runtime_clean_new_head' || artifact?.status !== 'ready'
      || artifact.taskId !== stage.taskId || artifact.runId !== stage.runId || artifact.metadata.source !== 'work-collaboration'
      || artifact.metadata.commitId !== evidence.commitId || artifact.metadata.sessionId !== evidence.sessionId
      || run?.status !== 'completed' || run.taskId !== stage.taskId || run.metadata.collaborationId !== intent.id
      || run.metadata.role !== 'implementation') throw new Error('verified_revision_required');
    return { owner: intent.ownerActorId, evidence, stage, conversationId: intent.conversationId };
  };
  const before = owningRevision(await coreStore.readCore());
  const observed = await (options.inspect ?? inspectCandidateBuild)(request);
  const matches = (['platform', 'runtime'] as const).filter(key => observed.members[key].head === before.evidence.commitId
    && samePath(observed.members[key].checkout, before.evidence.workspacePath));
  const memberKey = matches[0];
  if (matches.length !== 1 || !memberKey) {
    throw new Error('candidate_implementation_revision_mismatch');
  }
  const member = observed.members[memberKey];
  const identity = { taskId, runId: before.stage.runId, revisionArtifactId: before.evidence.artifactId,
    root: observed.root, launchId: observed.launchId, instanceId: observed.instanceId, member: memberKey, members: observed.members };
  const id = `artifact-candidate-${digest(identity).slice(0, 32)}`;
  let created = false;
  await coreStore.updateCore(core => {
    if (digest(owningRevision(core)) !== digest(before)) throw new Error('candidate_owner_revision_changed');
    const existing = core.artifacts.find(row => row.id === id);
    if (existing) {
      if (existing.metadata.candidateIdentity !== digest(identity)) throw new Error('candidate_artifact_conflict');
      return core;
    }
    created = true;
    return upsertCoreArtifact(core, { id, taskId: before.stage.taskId, runId: before.stage.runId, conversationId: before.conversationId,
      title: `Cats Desktop candidate ${member.head.slice(0, 12)}`, kind: 'build', status: 'ready', path: observed.root,
      summary: 'Candidate source inputs match the recorded implementation commit. Host receipt was inspected. This is build evidence; bug validation and independent approval remain separate.',
      metadata: { source: 'work-candidate', candidateIdentity: digest(identity), revisionArtifactId: before.evidence.artifactId,
        collaborationId: taskId, implementationTaskId: before.stage.taskId, implementationMember: memberKey,
        dependencyMember: memberKey === 'platform' ? 'runtime' : 'platform', candidate: observed,
        verification: observed.verification, claim: 'observed_build_evidence' },
    }).core;
  });
  return { artifactId: id, created, path: `/code/artifacts/${encodeURIComponent(id)}` };
}
