import path from 'node:path';
import { createHash } from 'node:crypto';

export interface CandidateRevisionRef {
  member: 'platform' | 'runtime'; taskId: string; runId: string;
  revisionArtifactId: string; checkout: string; commitId: string;
}

export interface CandidateRevisionSet { members: CandidateRevisionRef[]; sha256: string }

export interface CandidateOwnership {
  schemaVersion: 1; kind: 'cats-desktop-candidate'; artifactId: string; taskId: string;
  runId: string; revisionArtifactId: string; root: string; member: 'platform' | 'runtime';
  checkout: string; commitId: string; preparedAt: string;
  revisionSet?: CandidateRevisionSet;
}

export function candidateRevisionRef(value: CandidateRevisionRef): CandidateRevisionRef {
  return { member: value.member, taskId: value.taskId, runId: value.runId,
    revisionArtifactId: value.revisionArtifactId, checkout: value.checkout, commitId: value.commitId };
}

export function createCandidateRevisionSet(members: CandidateRevisionRef[]): CandidateRevisionSet {
  const ordered = [...members].sort((a, b) => a.member.localeCompare(b.member)).map(candidateRevisionRef);
  return { members: ordered, sha256: createHash('sha256').update(JSON.stringify(ordered)).digest('hex') };
}

function readRevisionSet(value: unknown, primary: CandidateRevisionRef): CandidateRevisionSet {
  const v = value as CandidateRevisionSet;
  if (!v || typeof v !== 'object' || Object.keys(v).sort().join(',') !== 'members,sha256'
    || !Array.isArray(v.members) || v.members.length !== 2
    || v.members.some((row, index) => !row || typeof row !== 'object' || Array.isArray(row)
      || Object.keys(row).sort().join(',') !== 'checkout,commitId,member,revisionArtifactId,runId,taskId'
      || row.member !== (index === 0 ? 'platform' : 'runtime')
      || ['taskId', 'runId', 'revisionArtifactId', 'checkout', 'commitId'].some(key =>
        typeof row[key as keyof CandidateRevisionRef] !== 'string' || !row[key as keyof CandidateRevisionRef]
        || row[key as keyof CandidateRevisionRef].length > 4096)
      || !path.isAbsolute(row.checkout) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(row.commitId))
    || v.members[0]!.taskId === v.members[1]!.taskId
    || v.members[0]!.runId === v.members[1]!.runId
    || v.members[0]!.revisionArtifactId === v.members[1]!.revisionArtifactId) throw new Error('invalid_candidate_revision_set');
  const expected = createCandidateRevisionSet(v.members);
  if (v.sha256 !== expected.sha256 || !expected.members.some(row =>
    JSON.stringify(row) === JSON.stringify(candidateRevisionRef(primary)))) throw new Error('invalid_candidate_revision_set');
  return expected;
}

/** Association descriptor only. This is not an execution grant or credential. */
export function readCandidateOwnership(value: unknown): CandidateOwnership {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_candidate_ownership');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || v.kind !== 'cats-desktop-candidate'
    || Object.keys(v).filter(key => key !== 'revisionSet').sort().join(',') !== 'artifactId,checkout,commitId,kind,member,preparedAt,revisionArtifactId,root,runId,schemaVersion,taskId'
    || (v.member !== 'platform' && v.member !== 'runtime')
    || typeof v.commitId !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(v.commitId)
    || ['artifactId', 'taskId', 'runId', 'revisionArtifactId', 'root', 'checkout', 'preparedAt'].some(key =>
      typeof v[key] !== 'string' || !v[key] || String(v[key]).length > 4096)
    || !path.isAbsolute(String(v.root)) || !path.isAbsolute(String(v.checkout))
    || !Number.isFinite(Date.parse(String(v.preparedAt)))) throw new Error('invalid_candidate_ownership');
  const result: CandidateOwnership = { schemaVersion: 1, kind: 'cats-desktop-candidate', artifactId: String(v.artifactId), taskId: String(v.taskId),
    runId: String(v.runId), revisionArtifactId: String(v.revisionArtifactId), root: String(v.root),
    member: v.member as CandidateOwnership['member'], checkout: String(v.checkout), commitId: String(v.commitId), preparedAt: String(v.preparedAt) };
  if ('revisionSet' in v) result.revisionSet = readRevisionSet(v.revisionSet, result);
  return result;
}
