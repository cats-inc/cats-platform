import type {
  CompanionSourceKind,
  CompanionSourceRecord,
} from './contracts.js';
import type { CompanionBoxStore } from '../state/companion-box/index.js';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SupervisedToolManifest,
  type ToolResult,
} from '../../../platform/supervision/contracts.js';
import type { SupervisionRejectionCode } from '../../../platform/supervision/errors.js';
import type { SupervisedToolExecutor } from '../../../platform/supervision/toolBoundary.js';
import type { SupervisedToolRegistry } from '../../../platform/supervision/toolRegistry.js';

export const COMPANION_CONTENT_LIST_TOOL = 'companion.content.list' as const;
export const COMPANION_CONTENT_READ_TOOL = 'companion.content.read' as const;

const COMPANION_CONTENT_LIST_LIMIT = 20;
const COMPANION_CONTENT_READ_TEXT_LIMIT = 4000;

export interface CompanionContentResourceScope {
  kind: 'companion_content';
  catId: string;
  sourceIds?: string[];
  sourceKinds?: CompanionSourceKind[];
}

export interface CompanionContentListInput {
  catId: string;
  sourceKinds?: CompanionSourceKind[];
  limit?: number;
}

export interface CompanionContentListItem {
  sourceId: string;
  catId: string;
  kind: CompanionSourceKind;
  title: string | null;
  textExcerpt: string | null;
  sourceUrl: string | null;
  mimeType: string | null;
  originalFileName: string | null;
  updatedAt: string;
}

export interface CompanionContentListResult {
  catId: string;
  items: CompanionContentListItem[];
  limit: number;
}

export interface CompanionContentReadInput {
  catId: string;
  sourceId: string;
}

export interface CompanionContentReadResult extends CompanionContentListItem {
  storageMode: CompanionSourceRecord['storageMode'];
  ownerNote: string | null;
  sourceText: string | null;
  sourceTextTruncated: boolean;
  metadata: Record<string, unknown>;
}

export interface CompanionContentToolsOptions {
  companionStore: CompanionBoxStore;
  resourceScopes?: Array<Record<string, unknown>>;
  now?: () => Date;
}

export interface CompanionContentTools {
  manifests: SupervisedToolManifest[];
  resourceScopes: CompanionContentResourceScope[];
  executors: {
    [COMPANION_CONTENT_LIST_TOOL]: SupervisedToolExecutor<
      CompanionContentListInput,
      CompanionContentListResult
    >;
    [COMPANION_CONTENT_READ_TOOL]: SupervisedToolExecutor<
      CompanionContentReadInput,
      CompanionContentReadResult
    >;
  };
  register(registry: SupervisedToolRegistry): void;
}

export function createCompanionContentTools(
  options: CompanionContentToolsOptions,
): CompanionContentTools {
  const manifests = createCompanionContentToolManifests();
  const resourceScopes = normalizeCompanionContentResourceScopes(options.resourceScopes ?? []);

  return {
    manifests,
    resourceScopes,
    executors: {
      [COMPANION_CONTENT_LIST_TOOL]: createCompanionContentListExecutor({
        companionStore: options.companionStore,
        resourceScopes,
        now: options.now,
      }),
      [COMPANION_CONTENT_READ_TOOL]: createCompanionContentReadExecutor({
        companionStore: options.companionStore,
        resourceScopes,
        now: options.now,
      }),
    },
    register(registry) {
      for (const manifest of manifests) {
        registry.register(manifest);
      }
    },
  };
}

export function createCompanionContentToolManifests(): SupervisedToolManifest[] {
  return [
    createManifest({
      name: COMPANION_CONTENT_LIST_TOOL,
      description: 'List companion content sources inside declared resource scopes.',
    }),
    createManifest({
      name: COMPANION_CONTENT_READ_TOOL,
      description: 'Read one companion content source inside declared resource scopes.',
    }),
  ];
}

export function normalizeCompanionContentResourceScopes(
  scopes: Array<Record<string, unknown>>,
): CompanionContentResourceScope[] {
  return scopes
    .map((scope) => {
      if (scope.kind !== 'companion_content') {
        return null;
      }

      const catId = readNonEmptyString(scope.catId);
      if (!catId) {
        return null;
      }

      return {
        kind: 'companion_content' as const,
        catId,
        ...(readStringArray(scope.sourceIds) === undefined
          ? {}
          : { sourceIds: readStringArray(scope.sourceIds) }),
        ...(readCompanionSourceKinds(scope.sourceKinds) === undefined
          ? {}
          : { sourceKinds: readCompanionSourceKinds(scope.sourceKinds) }),
      };
    })
    .filter((scope): scope is CompanionContentResourceScope => scope !== null);
}

function createCompanionContentListExecutor(input: {
  companionStore: CompanionBoxStore;
  resourceScopes: CompanionContentResourceScope[];
  now?: () => Date;
}): SupervisedToolExecutor<CompanionContentListInput, CompanionContentListResult> {
  return async (rawInput) => {
    const normalized = normalizeListInput(rawInput);
    if (normalized.status !== 'applied') {
      return normalized;
    }

    const scope = resolveCatScope(input.resourceScopes, normalized.result.catId);
    if (!scope) {
      return rejected(
        'E_NOT_AUTHORIZED',
        `Companion content scope is not declared: ${normalized.result.catId}`,
      );
    }
    if (!requestedKindsAllowed(scope, normalized.result.sourceKinds)) {
      return rejected('E_NOT_AUTHORIZED', 'Requested companion content kind is outside scope.');
    }

    const sources = await input.companionStore.listSources(
      normalized.result.catId,
      input.now?.(),
    );
    const items = sources
      .filter((source) => sourceAllowedByScope(scope, source))
      .filter((source) =>
        normalized.result.sourceKinds.length === 0 ||
        normalized.result.sourceKinds.includes(source.kind),
      )
      .slice(0, normalized.result.limit)
      .map(toListItem);

    return {
      status: 'applied',
      result: {
        catId: normalized.result.catId,
        items,
        limit: normalized.result.limit,
      },
    };
  };
}

function createCompanionContentReadExecutor(input: {
  companionStore: CompanionBoxStore;
  resourceScopes: CompanionContentResourceScope[];
  now?: () => Date;
}): SupervisedToolExecutor<CompanionContentReadInput, CompanionContentReadResult> {
  return async (rawInput) => {
    const normalized = normalizeReadInput(rawInput);
    if (normalized.status !== 'applied') {
      return normalized;
    }

    const scope = resolveCatScope(input.resourceScopes, normalized.result.catId);
    if (!scope) {
      return rejected(
        'E_NOT_AUTHORIZED',
        `Companion content scope is not declared: ${normalized.result.catId}`,
      );
    }

    const sources = await input.companionStore.listSources(
      normalized.result.catId,
      input.now?.(),
    );
    const source = sources.find((candidate) => candidate.id === normalized.result.sourceId) ?? null;
    if (!source) {
      return rejected('E_PRECHECK_FAILED', `Companion content source not found.`);
    }
    if (!sourceAllowedByScope(scope, source)) {
      return rejected(
        'E_NOT_AUTHORIZED',
        `Companion content source is outside declared resource scope: ${source.id}`,
      );
    }

    return {
      status: 'applied',
      result: toReadResult(source),
    };
  };
}

function createManifest(input: {
  name: typeof COMPANION_CONTENT_LIST_TOOL | typeof COMPANION_CONTENT_READ_TOOL;
  description: string;
}): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: input.name,
    manifestVersion: '1.0',
    description: input.description,
    sideEffect: 'none',
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: 'never',
    evidence: 'summary',
    failureCodes: ['E_NOT_AUTHORIZED', 'E_PRECHECK_FAILED', 'E_SCHEMA_INVALID'],
    inputSchema: {
      id: `${input.name}.input`,
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: `${input.name}.output`,
      version: '1.0',
      format: 'json_schema',
    },
  };
}

function normalizeListInput(input: CompanionContentListInput): ToolResult<{
  catId: string;
  sourceKinds: CompanionSourceKind[];
  limit: number;
}> {
  if (!isRecord(input)) {
    return rejected('E_SCHEMA_INVALID', 'Companion content list input must be an object.');
  }

  const catId = readNonEmptyString(input.catId);
  if (!catId) {
    return rejected('E_SCHEMA_INVALID', 'Companion content list catId is required.');
  }

  if (containsInvalidCompanionSourceKind(input.sourceKinds)) {
    return rejected('E_SCHEMA_INVALID', 'Companion content list sourceKinds are invalid.');
  }

  const sourceKinds = readCompanionSourceKinds(input.sourceKinds) ?? [];
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit)
    ? Math.max(1, Math.min(COMPANION_CONTENT_LIST_LIMIT, Math.floor(input.limit)))
    : COMPANION_CONTENT_LIST_LIMIT;

  return {
    status: 'applied',
    result: {
      catId,
      sourceKinds,
      limit,
    },
  };
}

function normalizeReadInput(input: CompanionContentReadInput): ToolResult<{
  catId: string;
  sourceId: string;
}> {
  if (!isRecord(input)) {
    return rejected('E_SCHEMA_INVALID', 'Companion content read input must be an object.');
  }

  const catId = readNonEmptyString(input.catId);
  if (!catId) {
    return rejected('E_SCHEMA_INVALID', 'Companion content read catId is required.');
  }

  const sourceId = readNonEmptyString(input.sourceId);
  if (!sourceId) {
    return rejected('E_SCHEMA_INVALID', 'Companion content read sourceId is required.');
  }

  return {
    status: 'applied',
    result: {
      catId,
      sourceId,
    },
  };
}

function resolveCatScope(
  scopes: CompanionContentResourceScope[],
  catId: string,
): CompanionContentResourceScope | null {
  return scopes.find((scope) => scope.catId === catId) ?? null;
}

function requestedKindsAllowed(
  scope: CompanionContentResourceScope,
  sourceKinds: CompanionSourceKind[],
): boolean {
  return !scope.sourceKinds ||
    sourceKinds.every((sourceKind) => scope.sourceKinds?.includes(sourceKind));
}

function sourceAllowedByScope(
  scope: CompanionContentResourceScope,
  source: CompanionSourceRecord,
): boolean {
  if (scope.sourceIds && !scope.sourceIds.includes(source.id)) {
    return false;
  }
  if (scope.sourceKinds && !scope.sourceKinds.includes(source.kind)) {
    return false;
  }
  return true;
}

function toListItem(source: CompanionSourceRecord): CompanionContentListItem {
  return {
    sourceId: source.id,
    catId: source.catId,
    kind: source.kind,
    title: source.title,
    textExcerpt: source.textExcerpt,
    sourceUrl: source.sourceUrl,
    mimeType: source.mimeType,
    originalFileName: source.originalFileName,
    updatedAt: source.updatedAt,
  };
}

function toReadResult(source: CompanionSourceRecord): CompanionContentReadResult {
  const sourceText = trimToLimit(source.sourceText, COMPANION_CONTENT_READ_TEXT_LIMIT);
  return {
    ...toListItem(source),
    storageMode: source.storageMode,
    ownerNote: source.ownerNote,
    sourceText: sourceText.value,
    sourceTextTruncated: sourceText.truncated,
    metadata: structuredClone(source.metadata),
  };
}

function trimToLimit(value: string | null, limit: number): {
  value: string | null;
  truncated: boolean;
} {
  if (!value || value.length <= limit) {
    return {
      value,
      truncated: false,
    };
  }

  return {
    value: value.slice(0, limit),
    truncated: true,
  };
}

function readCompanionSourceKinds(value: unknown): CompanionSourceKind[] | undefined {
  const strings = readStringArray(value);
  if (strings === undefined) {
    return undefined;
  }

  return strings.filter((item): item is CompanionSourceKind => isCompanionSourceKind(item));
}

function readStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function isCompanionSourceKind(value: string): value is CompanionSourceKind {
  return [
    'note',
    'conversation_log',
    'article',
    'image',
    'video',
    'audio',
    'path_ref',
  ].includes(value);
}

function containsInvalidCompanionSourceKind(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) =>
    typeof item !== 'string' || !isCompanionSourceKind(item.trim()),
  );
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function rejected<T>(
  code: SupervisionRejectionCode,
  message: string,
  details?: unknown,
): ToolResult<T> {
  return {
    status: 'rejected',
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}
