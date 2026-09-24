import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PLATFORM_VERSION, supportsVersion } from '#cats-app-package';
import { resolveBundledPlatformConfigDir } from '../../shared/platformPaths.js';
import type { MessageLocale } from '../../shared/i18n/index.js';

export const CATLAS_KNOWLEDGE_FILE = 'catlas-knowledge.json';
export const CATLAS_CODE_CAPABILITIES = ['code-entry-v1'] as const;
const MAX_BUNDLE_BYTES = 128 * 1024;
const MAX_CONTEXT_CHARACTERS = 16_000;

export interface CatlasKnowledgeEntry {
  id: string;
  revision: number;
  digest: string;
  topics: string[];
  verifiedAt: string;
  sources: string[];
  content: string;
}

export interface CatlasKnowledgeBundle {
  revision: string;
  digest: string;
  locale: MessageLocale;
  entries: CatlasKnowledgeEntry[];
}

export type CatlasKnowledgeResult =
  | { status: 'ready'; bundle: CatlasKnowledgeBundle }
  | { status: 'missing' | 'invalid' | 'incompatible' };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= limit
    && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 200);
}

export function catlasDigest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function loadCatlasKnowledge(options: {
  filePath?: string;
  platformVersion?: string;
  capabilities?: readonly string[];
  locale: MessageLocale;
}): Promise<CatlasKnowledgeResult> {
  let bytes: Buffer;
  try {
    const filePath = options.filePath
      ?? join(resolveBundledPlatformConfigDir(), CATLAS_KNOWLEDGE_FILE);
    const info = await stat(filePath);
    if (!info.isFile() || info.size > MAX_BUNDLE_BYTES) return { status: 'invalid' };
    bytes = await readFile(filePath);
  } catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid' };
  }
  try {
    if (bytes.length > MAX_BUNDLE_BYTES) return { status: 'invalid' };
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!record(raw) || raw.schemaVersion !== 1
      || typeof raw.revision !== 'string' || !/^[\w.-]{1,64}$/u.test(raw.revision)
      || typeof raw.platformRange !== 'string' || !strings(raw.requiredCapabilities, 16)
      || !Array.isArray(raw.entries) || raw.entries.length === 0 || raw.entries.length > 32) {
      return { status: 'invalid' };
    }
    if (!supportsVersion(options.platformVersion ?? PLATFORM_VERSION, raw.platformRange)
      || !raw.requiredCapabilities.every((capability) =>
        (options.capabilities ?? CATLAS_CODE_CAPABILITIES).includes(capability))) {
      return { status: 'incompatible' };
    }
    const entries: CatlasKnowledgeEntry[] = [];
    const seen = new Set<string>();
    for (const entry of raw.entries) {
      if (!record(entry) || typeof entry.id !== 'string'
        || !/^[a-z][a-z0-9.-]{0,79}$/u.test(entry.id) || seen.has(entry.id)
        || !Number.isSafeInteger(entry.revision) || (entry.revision as number) < 1
        || !strings(entry.topics, 8) || !strings(entry.sources, 8)
        || typeof entry.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(entry.verifiedAt)
        || !record(entry.content)) return { status: 'invalid' };
      const content = entry.content[options.locale];
      if (typeof content !== 'string' || !content.trim() || content.length > 4_000) {
        return { status: 'invalid' };
      }
      seen.add(entry.id);
      entries.push({
        id: entry.id,
        revision: entry.revision as number,
        digest: catlasDigest(content),
        topics: entry.topics,
        verifiedAt: entry.verifiedAt,
        sources: entry.sources,
        content,
      });
    }
    return { status: 'ready', bundle: {
      revision: raw.revision, digest: catlasDigest(bytes), locale: options.locale, entries,
    } };
  } catch {
    return { status: 'invalid' };
  }
}

export function selectCatlasKnowledge(
  bundle: CatlasKnowledgeBundle,
  topics: readonly string[],
): CatlasKnowledgeEntry[] {
  let remaining = MAX_CONTEXT_CHARACTERS;
  return bundle.entries.filter((entry) => {
    if (!entry.topics.some((topic) => topic === 'always' || topics.includes(topic))) return false;
    if (entry.content.length > remaining) return false;
    remaining -= entry.content.length;
    return true;
  });
}
