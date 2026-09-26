export type LocalKnowledgeTarget = 'catlas' | 'orchestrator';
export interface LocalKnowledgeText { en: string; 'zh-TW': string }
export interface LocalKnowledgeDraft {
  id: string;
  target: LocalKnowledgeTarget;
  entryId: string;
  bundleDigest: string;
  before: LocalKnowledgeText;
  content: LocalKnowledgeText;
  note: string;
  createdAt: string;
  adoptedAt?: string;
}
export interface LocalKnowledgeWorkspace {
  revision: string;
  targets: { target: LocalKnowledgeTarget; entries: {
    id: string; content: LocalKnowledgeText; activeId: string | null;
  }[] }[];
  drafts: (LocalKnowledgeDraft & { active: boolean; stale: boolean })[];
}
export const LOCAL_KNOWLEDGE_API = '/api/code/knowledge';
