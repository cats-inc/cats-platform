/** Portable, non-executable proposal. Uploaded provenance is a claim, not verification. */
export interface PracticeDevelopmentProposal {
  schemaVersion: 1;
  source: 'cats-practice';
  category: 'product_defect';
  evidenceMode: 'fixture' | 'product';
  runId: string;
  attemptId: string;
  attemptDigest: string;
  candidateDigest: string;
  exerciseDigest: string;
  diagnosisDigest: string;
  diagnosedBy: string;
  title: string;
  summary: string;
}

export function parsePracticeProposal(value: unknown): PracticeDevelopmentProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_practice_proposal');
  const row = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'source', 'category', 'evidenceMode', 'runId', 'attemptId',
    'attemptDigest', 'candidateDigest', 'exerciseDigest', 'diagnosisDigest', 'diagnosedBy', 'title', 'summary'];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))
    || row.schemaVersion !== 1 || row.source !== 'cats-practice' || row.category !== 'product_defect'
    || (row.evidenceMode !== 'fixture' && row.evidenceMode !== 'product')
    || typeof row.runId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(row.runId)
    || typeof row.attemptId !== 'string' || !/^\d{4}$/u.test(row.attemptId)
    || typeof row.diagnosedBy !== 'string' || !/^[a-z][a-z0-9._-]{0,79}$/u.test(row.diagnosedBy)
    || ['attemptDigest', 'candidateDigest', 'exerciseDigest', 'diagnosisDigest']
      .some(key => typeof row[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(row[key] as string))) throw new Error('invalid_practice_proposal');
  for (const [key, max] of [['title', 160], ['summary', 2000]] as const) {
    const text = row[key];
    if (typeof text !== 'string' || !text.trim() || text.length > max
      || /(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/|Bearer\s+\S+|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|\.agents[\\/]|SKILL\.md|cats-inc-development|cats-practice-and-distill)/u.test(text)) {
      throw new Error('unsanitized_practice_proposal');
    }
  }
  return { ...row } as unknown as PracticeDevelopmentProposal;
}
