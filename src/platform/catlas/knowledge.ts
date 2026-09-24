import { join } from 'node:path';
import { resolveBundledPlatformConfigDir } from '../../shared/platformPaths.js';
import type { MessageLocale } from '../../shared/i18n/index.js';
import {
  knowledgeDigest,
  loadProductKnowledge,
  selectProductKnowledge,
  type ProductKnowledgeBundle,
  type ProductKnowledgeEntry,
  type ProductKnowledgeResult,
} from '../knowledge/productKnowledge.js';

export const CATLAS_KNOWLEDGE_FILE = 'catlas-knowledge.json';
export const CATLAS_CODE_CAPABILITIES = ['code-entry-v1'] as const;
export type CatlasKnowledgeEntry = ProductKnowledgeEntry;
export type CatlasKnowledgeBundle = ProductKnowledgeBundle;
export type CatlasKnowledgeResult = ProductKnowledgeResult;
export const catlasDigest = knowledgeDigest;

export function loadCatlasKnowledge(options: {
  filePath?: string;
  platformVersion?: string;
  capabilities?: readonly string[];
  locale: MessageLocale;
}): Promise<CatlasKnowledgeResult> {
  return loadProductKnowledge({
    ...options,
    filePath: options.filePath ?? join(resolveBundledPlatformConfigDir(), CATLAS_KNOWLEDGE_FILE),
    capabilities: options.capabilities ?? CATLAS_CODE_CAPABILITIES,
  });
}

export function selectCatlasKnowledge(
  bundle: CatlasKnowledgeBundle,
  topics: readonly string[],
): CatlasKnowledgeEntry[] {
  return selectProductKnowledge(bundle, { role: 'catlas', surface: 'code-help', topics, operations: [] });
}
