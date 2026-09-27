import path from 'node:path';

export interface CandidateOwnership {
  schemaVersion: 1; kind: 'cats-desktop-candidate'; artifactId: string; taskId: string;
  runId: string; revisionArtifactId: string; root: string; member: 'platform' | 'runtime';
  checkout: string; commitId: string; preparedAt: string;
}

/** Association descriptor only. This is not an execution grant or credential. */
export function readCandidateOwnership(value: unknown): CandidateOwnership {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_candidate_ownership');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || v.kind !== 'cats-desktop-candidate'
    || Object.keys(v).sort().join(',') !== 'artifactId,checkout,commitId,kind,member,preparedAt,revisionArtifactId,root,runId,schemaVersion,taskId'
    || (v.member !== 'platform' && v.member !== 'runtime')
    || typeof v.commitId !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(v.commitId)
    || ['artifactId', 'taskId', 'runId', 'revisionArtifactId', 'root', 'checkout', 'preparedAt'].some(key =>
      typeof v[key] !== 'string' || !v[key] || String(v[key]).length > 4096)
    || !path.isAbsolute(String(v.root)) || !path.isAbsolute(String(v.checkout))
    || !Number.isFinite(Date.parse(String(v.preparedAt)))) throw new Error('invalid_candidate_ownership');
  return { schemaVersion: 1, kind: 'cats-desktop-candidate', artifactId: String(v.artifactId), taskId: String(v.taskId),
    runId: String(v.runId), revisionArtifactId: String(v.revisionArtifactId), root: String(v.root),
    member: v.member as CandidateOwnership['member'], checkout: String(v.checkout), commitId: String(v.commitId), preparedAt: String(v.preparedAt) };
}
