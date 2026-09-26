export interface KnowledgeCandidatePreview {
  entries: { id: string; en: string; zhTW: string }[];
  counterexamples: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** A bounded display snapshot only. This never validates or promotes knowledge. */
export function readKnowledgeCandidatePreview(metadata: unknown): KnowledgeCandidatePreview | null {
  const source = record(metadata);
  const candidate = record(source?.knowledgeCandidate);
  if (source?.source !== 'preview-knowledge-authoring'
    || candidate?.schemaVersion !== 1 || candidate.state !== 'unverified') return null;
  const draft = record(candidate.draft);
  const knowledge = record(draft?.knowledge);
  if (!Array.isArray(knowledge?.entries) || !knowledge.entries.length
    || knowledge.entries.length > 32 || !Array.isArray(draft?.counterexamples)
    || !draft.counterexamples.length || draft.counterexamples.length > 16) return null;
  let characters = 0;
  const text = (value: unknown, limit = 16_000): value is string => {
    if (typeof value !== 'string' || !value.trim() || value.length > limit) return false;
    characters += value.length;
    return characters <= 128 * 1024;
  };
  const entries: KnowledgeCandidatePreview['entries'] = [];
  const ids = new Set<string>();
  for (const value of knowledge.entries) {
    const entry = record(value), content = record(entry?.content);
    if (!text(entry?.id, 160) || ids.has(entry.id)
      || !text(content?.en) || !text(content?.['zh-TW'])) return null;
    ids.add(entry.id);
    entries.push({ id: entry.id, en: content.en, zhTW: content['zh-TW'] });
  }
  if (!draft.counterexamples.every(value => text(value, 1_000))) return null;
  return { entries, counterexamples: draft.counterexamples as string[] };
}
