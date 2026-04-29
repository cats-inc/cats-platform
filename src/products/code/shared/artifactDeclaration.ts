import type {
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreRecordMetadata,
} from '../../../core/types.js';

export const CODE_ARTIFACT_DECLARATION_TOOL_NAME = 'declare_artifact' as const;
export const CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION = '1.0' as const;
export const CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION = 'v1' as const;

export type CodeArtifactProducerKind = 'agent' | 'tool' | 'system' | 'user';
export type CodeArtifactDisposition = 'record' | 'candidate';
export type CodeArtifactLocationKind =
  | 'none'
  | 'local_path'
  | 'url'
  | 'inline_summary'
  | 'external_ref';

export const CODE_ARTIFACT_PRODUCER_LABELS = [
  'preview_url',
  'build_output',
  'test_report',
  'review_report',
  'implementation_summary',
  'diff_summary',
  'changed_files_summary',
  'patch_bundle',
  'screenshot',
  'wireframe',
  'spec_document',
  'plan_document',
  'transcript_export',
  'dataset_file',
] as const;

export type CodeArtifactProducerLabel = (typeof CODE_ARTIFACT_PRODUCER_LABELS)[number];

export interface CodeArtifactLocation {
  kind: CodeArtifactLocationKind;
  value?: string | null;
  /**
   * Internal normalized-output marker. The agent-visible tool schema never
   * accepts this field; server materialization must clear it by validating the
   * path against the resolved workspace.
   */
  verification?: {
    workspaceContainment?: 'unverified';
  };
}

export interface CodeArtifactToolInput {
  declarationId: string;
  label: string;
  title: string;
  location: CodeArtifactLocation;
  summary?: string | null;
  metadata?: CoreRecordMetadata;
}

export interface CodeArtifactProducer {
  kind: CodeArtifactProducerKind;
  actorId?: string | null;
  toolName?: string | null;
  runtimeSessionId?: string | null;
}

export interface CodeArtifactDeclarationAnchors {
  conversationId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  workItemId?: string | null;
  workspacePath?: string | null;
}

export interface CodeArtifactDeclaration {
  declarationId: string;
  producer: CodeArtifactProducer;
  requestedDisposition?: CodeArtifactDisposition;
  requestedStatus?: CoreArtifactStatus;
  artifact: {
    title: string;
    label: string;
    coreKind?: CoreArtifactKind;
    summary?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  };
  location?: CodeArtifactLocation;
  anchors?: CodeArtifactDeclarationAnchors;
  metadata?: CoreRecordMetadata;
}

export interface CodeArtifactLabelMapping {
  label: CodeArtifactProducerLabel;
  coreKind: CoreArtifactKind;
  defaultStatus: Extract<CoreArtifactStatus, 'draft' | 'ready'>;
  defaultDisposition: CodeArtifactDisposition;
}

export interface CodeArtifactToolParameterSchema {
  type: 'object';
  additionalProperties: false;
  required: readonly ['declarationId', 'label', 'title', 'location'];
  properties: {
    declarationId: { type: 'string'; minLength: 1 };
    label: { type: 'string'; minLength: 1 };
    title: { type: 'string'; minLength: 1 };
    location: {
      type: 'object';
      additionalProperties: false;
      required: readonly ['kind'];
      properties: {
        kind: { type: 'string'; enum: readonly CodeArtifactLocationKind[] };
        value: { type: readonly ['string', 'null'] };
      };
    };
    summary: { type: readonly ['string', 'null'] };
    metadata: { type: 'object'; additionalProperties: true };
  };
}

export interface CodeArtifactRuntimeToolDefinition {
  name: typeof CODE_ARTIFACT_DECLARATION_TOOL_NAME;
  description: string;
  schemaVersion: typeof CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION;
  inputSchema: CodeArtifactToolParameterSchema;
}

export type CodeArtifactToolShapeResult =
  | {
      status: 'shape_ok';
      declarationId: string;
      input: CodeArtifactToolInput;
    }
  | {
      status: 'rejected';
      error: {
        code: CodeArtifactDeclarationErrorCode;
        message: string;
        details?: unknown;
      };
    };

export type CodeArtifactToolResult =
  | {
      status: 'accepted';
      declarationId: string;
      disposition: CodeArtifactDisposition;
      artifactId?: string | null;
      artifactStatus?: Extract<CoreArtifactStatus, 'draft' | 'ready' | 'published'> | null;
    }
  | {
      status: 'rejected';
      error: {
        code: CodeArtifactDeclarationErrorCode;
        message: string;
        details?: unknown;
      };
    };

export const CODE_ARTIFACT_DECLARATION_ERROR_CODES = [
  'artifact_required_field_empty',
  'artifact_location_kind_invalid',
  'artifact_location_required',
  'artifact_location_value_required',
  'artifact_location_value_invalid',
  'artifact_location_evidence_required',
  'artifact_local_path_invalid',
  'artifact_url_credentials_not_allowed',
  'artifact_inline_summary_too_large',
  'artifact_external_ref_invalid',
  'artifact_external_ref_kind_not_allowed',
  'artifact_metadata_invalid',
  'artifact_metadata_too_large',
  'artifact_metadata_too_many_keys',
  'artifact_metadata_key_too_long',
  'artifact_metadata_reserved_key',
  'artifact_producer_field_not_allowed',
] as const;

export type CodeArtifactDeclarationErrorCode =
  (typeof CODE_ARTIFACT_DECLARATION_ERROR_CODES)[number];

const AGENT_VISIBLE_TOOL_FIELDS = new Set([
  'declarationId',
  'label',
  'title',
  'location',
  'summary',
  'metadata',
]);

type CodeArtifactLabelMappingDefaults = Omit<CodeArtifactLabelMapping, 'label'>;

const CODE_ARTIFACT_LABEL_MAPPING_BY_LABEL = {
  preview_url: {
    coreKind: 'preview',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  build_output: {
    coreKind: 'build',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  test_report: {
    coreKind: 'report',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  review_report: {
    coreKind: 'report',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  implementation_summary: {
    coreKind: 'report',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  diff_summary: {
    coreKind: 'report',
    defaultStatus: 'draft',
    defaultDisposition: 'candidate',
  },
  changed_files_summary: {
    coreKind: 'report',
    defaultStatus: 'draft',
    defaultDisposition: 'candidate',
  },
  patch_bundle: {
    coreKind: 'attachment',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  screenshot: {
    coreKind: 'attachment',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  wireframe: {
    coreKind: 'document',
    defaultStatus: 'draft',
    defaultDisposition: 'record',
  },
  spec_document: {
    coreKind: 'document',
    defaultStatus: 'draft',
    defaultDisposition: 'record',
  },
  plan_document: {
    coreKind: 'document',
    defaultStatus: 'draft',
    defaultDisposition: 'record',
  },
  transcript_export: {
    coreKind: 'transcript_export',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  dataset_file: {
    coreKind: 'dataset',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
} satisfies Record<CodeArtifactProducerLabel, CodeArtifactLabelMappingDefaults>;

export const CODE_ARTIFACT_LABEL_MAPPINGS: readonly CodeArtifactLabelMapping[] =
  CODE_ARTIFACT_PRODUCER_LABELS.map((label) => ({
    label,
    ...CODE_ARTIFACT_LABEL_MAPPING_BY_LABEL[label],
  }));

const CODE_ARTIFACT_EXTERNAL_REF_KINDS = [
  'upload',
  'runtime_artifact',
  'storage_object',
] as const;

const CODE_ARTIFACT_METADATA_MAX_BYTES = 16 * 1024;
const CODE_ARTIFACT_METADATA_MAX_TOP_LEVEL_KEYS = 32;
const CODE_ARTIFACT_METADATA_MAX_KEY_LENGTH = 64;
const CODE_ARTIFACT_INLINE_SUMMARY_MAX_BYTES = 8 * 1024;

const CODE_ARTIFACT_METADATA_RESERVED_KEYS = new Set([
  'id',
  'title',
  'kind',
  'status',
  'projectId',
  'workItemId',
  'conversationId',
  'taskId',
  'runId',
  'path',
  'mimeType',
  'sizeBytes',
  'summary',
  'createdAt',
  'updatedAt',
  'metadata',
]);

export class CodeArtifactDeclarationError extends Error {
  constructor(
    readonly code: CodeArtifactDeclarationErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CodeArtifactDeclarationError';
  }
}

export class CodeArtifactDeclarationTool {
  readonly name = CODE_ARTIFACT_DECLARATION_TOOL_NAME;

  readonly definition: CodeArtifactRuntimeToolDefinition = {
    name: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
    schemaVersion: CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION,
    description: [
      'Record durable Code outputs using producer labels, not Core artifact kinds.',
      'Declare builds, previews, reports, documents, patch bundles, screenshots, transcript exports, and datasets.',
      'Do not declare source edits, scratch files, dependency caches, lockfiles, or failed partial outputs.',
    ].join(' '),
    inputSchema: createDeclareArtifactToolInputSchema(),
  };

  normalizeInput(input: unknown): CodeArtifactToolInput {
    return normalizeCodeArtifactToolInput(input);
  }

  createDeclaration(
    input: CodeArtifactToolInput,
    producer: CodeArtifactProducer,
    anchors: CodeArtifactDeclarationAnchors = {},
  ): CodeArtifactDeclaration {
    const mapping = resolveCodeArtifactLabelMapping(input.label);

    return {
      declarationId: input.declarationId,
      producer,
      artifact: {
        title: input.title,
        label: input.label,
        coreKind: mapping.coreKind,
        summary: input.summary ?? null,
      },
      location: input.location,
      anchors,
      metadata: input.metadata ? structuredClone(input.metadata) : {},
    };
  }

  shapeOk(input: CodeArtifactToolInput): CodeArtifactToolShapeResult {
    return {
      status: 'shape_ok',
      declarationId: input.declarationId,
      input,
    };
  }

  materializationAccepted(input: {
    declarationId: string;
    disposition: CodeArtifactDisposition;
    artifactId?: string | null;
    artifactStatus?: Extract<CoreArtifactStatus, 'draft' | 'ready' | 'published'> | null;
  }): CodeArtifactToolResult {
    return {
      status: 'accepted',
      declarationId: input.declarationId,
      disposition: input.disposition,
      artifactId: input.artifactId ?? null,
      artifactStatus: input.artifactStatus ?? null,
    };
  }

  rejected(error: CodeArtifactDeclarationError): CodeArtifactToolResult {
    return {
      status: 'rejected',
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
}

export const CODE_ARTIFACT_DECLARATION_TOOL = new CodeArtifactDeclarationTool();

export function createDeclareArtifactToolInputSchema(): CodeArtifactToolParameterSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['declarationId', 'label', 'title', 'location'],
    properties: {
      declarationId: { type: 'string', minLength: 1 },
      label: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      location: {
        type: 'object',
        additionalProperties: false,
        required: ['kind'],
        properties: {
          kind: {
            type: 'string',
            enum: ['none', 'local_path', 'url', 'inline_summary', 'external_ref'],
          },
          value: { type: ['string', 'null'] },
        },
      },
      summary: { type: ['string', 'null'] },
      metadata: { type: 'object', additionalProperties: true },
    },
  };
}

export function normalizeCodeArtifactToolInput(input: unknown): CodeArtifactToolInput {
  if (!isRecord(input)) {
    throw new CodeArtifactDeclarationError(
      'artifact_required_field_empty',
      'declare_artifact input must be an object.',
    );
  }

  const declarationId = readRequiredString(input.declarationId, 'declarationId');
  const label = readRequiredString(input.label, 'label');
  const title = readRequiredString(input.title, 'title');
  const location = normalizeCodeArtifactLocation(input.location);
  const summary = normalizeOptionalString(input.summary);
  const metadata = normalizeCodeArtifactMetadata(input.metadata);
  const effectiveSummary =
    summary ?? (location.kind === 'inline_summary'
      ? normalizeOptionalString(location.value)
      : undefined);

  assertLocationCrossFieldRules(location, effectiveSummary, metadata);

  const disallowedFields = Object.entries(input)
    .filter(([key, value]) =>
      !AGENT_VISIBLE_TOOL_FIELDS.has(key) && isMeaningfulDisallowedFieldValue(value))
    .map(([key]) => key);
  if (disallowedFields.length > 0) {
    throw new CodeArtifactDeclarationError(
      'artifact_producer_field_not_allowed',
      'declare_artifact input includes server-resolved fields.',
      { fields: disallowedFields.sort() },
    );
  }

  return {
    declarationId,
    label,
    title,
    location,
    ...(effectiveSummary !== undefined ? { summary: effectiveSummary } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

export function resolveCodeArtifactLabelMapping(label: string): CodeArtifactLabelMapping {
  const normalizedLabel = label.trim();
  return isCodeArtifactProducerLabel(normalizedLabel)
    ? {
        label: normalizedLabel,
        ...CODE_ARTIFACT_LABEL_MAPPING_BY_LABEL[normalizedLabel],
      }
    : {
        label: normalizedLabel as CodeArtifactProducerLabel,
        coreKind: 'report',
        defaultStatus: 'draft',
        defaultDisposition: 'candidate',
      };
}

function normalizeCodeArtifactLocation(input: unknown): CodeArtifactLocation {
  if (!isRecord(input)) {
    throw new CodeArtifactDeclarationError(
      'artifact_location_required',
      'declare_artifact location is required.',
    );
  }

  const kind = normalizeOptionalString(input.kind);
  if (!isCodeArtifactLocationKind(kind)) {
    throw new CodeArtifactDeclarationError(
      'artifact_location_kind_invalid',
      'declare_artifact location.kind is invalid.',
      { kind },
    );
  }

  const value = normalizeOptionalString(input.value);
  if (kind !== 'none' && value === undefined) {
    throw new CodeArtifactDeclarationError(
      'artifact_location_value_required',
      'declare_artifact location.value is required for this location kind.',
      { kind },
    );
  }

  const normalizedValue = value === undefined
    ? undefined
    : normalizeLocationValue(kind, value);

  const location: CodeArtifactLocation = {
    kind,
    ...(normalizedValue !== undefined ? { value: normalizedValue } : {}),
  };
  if (kind === 'local_path') {
    location.verification = { workspaceContainment: 'unverified' };
  }

  return location;
}

function normalizeCodeArtifactMetadata(input: unknown): CoreRecordMetadata | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!isPlainRecord(input)) {
    throw new CodeArtifactDeclarationError(
      'artifact_metadata_invalid',
      'declare_artifact metadata must be a plain object when provided.',
    );
  }

  const keys = Object.keys(input);
  if (keys.length > CODE_ARTIFACT_METADATA_MAX_TOP_LEVEL_KEYS) {
    throw new CodeArtifactDeclarationError(
      'artifact_metadata_too_many_keys',
      'declare_artifact metadata has too many top-level keys.',
      {
        maxTopLevelKeys: CODE_ARTIFACT_METADATA_MAX_TOP_LEVEL_KEYS,
        actualTopLevelKeys: keys.length,
      },
    );
  }

  const longKey = keys.find((key) => key.length > CODE_ARTIFACT_METADATA_MAX_KEY_LENGTH);
  if (longKey !== undefined) {
    throw new CodeArtifactDeclarationError(
      'artifact_metadata_key_too_long',
      'declare_artifact metadata contains a key that is too long.',
      {
        key: longKey,
        maxKeyLength: CODE_ARTIFACT_METADATA_MAX_KEY_LENGTH,
      },
    );
  }

  const reservedKey = keys.find((key) => CODE_ARTIFACT_METADATA_RESERVED_KEYS.has(key));
  if (reservedKey !== undefined) {
    throw new CodeArtifactDeclarationError(
      'artifact_metadata_reserved_key',
      'declare_artifact metadata contains a reserved Core artifact field.',
      { key: reservedKey },
    );
  }

  if (!isJsonSerializable(input)) {
    throw new CodeArtifactDeclarationError(
      'artifact_metadata_invalid',
      'declare_artifact metadata must be JSON-serializable.',
    );
  }

  const json = JSON.stringify(input);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > CODE_ARTIFACT_METADATA_MAX_BYTES) {
    throw new CodeArtifactDeclarationError(
      'artifact_metadata_too_large',
      'declare_artifact metadata exceeds the serialized size limit.',
      {
        maxBytes: CODE_ARTIFACT_METADATA_MAX_BYTES,
        actualBytes: bytes,
      },
    );
  }

  return JSON.parse(json) as CoreRecordMetadata;
}

function readRequiredString(input: unknown, field: string): string {
  const value = normalizeOptionalString(input);
  if (value === undefined) {
    throw new CodeArtifactDeclarationError(
      'artifact_required_field_empty',
      `declare_artifact ${field} is required.`,
      { field },
    );
  }
  return value;
}

function normalizeOptionalString(input: unknown): string | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }
  if (typeof input !== 'string') {
    return undefined;
  }
  const value = input.trim();
  return value.length > 0 ? value : undefined;
}

function isCodeArtifactLocationKind(input: unknown): input is CodeArtifactLocationKind {
  return input === 'none'
    || input === 'local_path'
    || input === 'url'
    || input === 'inline_summary'
    || input === 'external_ref';
}

function isCodeArtifactProducerLabel(input: string): input is CodeArtifactProducerLabel {
  return CODE_ARTIFACT_PRODUCER_LABELS.includes(input as CodeArtifactProducerLabel);
}

function normalizeLocationValue(
  kind: CodeArtifactLocationKind,
  value: string,
): string {
  switch (kind) {
    case 'none':
      return value;
    case 'local_path':
      return normalizeLocalPathLocationValue(value);
    case 'url':
      return normalizeUrlLocationValue(value);
    case 'inline_summary':
      return normalizeInlineSummaryLocationValue(value);
    case 'external_ref':
      return normalizeExternalRefLocationValue(value);
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function normalizeLocalPathLocationValue(value: string): string {
  const separatorNormalizedValue = value.replaceAll('\\', '/');
  if (
    separatorNormalizedValue.includes('\0') ||
    isUrlLikeLocalPath(separatorNormalizedValue)
  ) {
    throw new CodeArtifactDeclarationError(
      'artifact_local_path_invalid',
      'declare_artifact local_path location must be a path, not a URL or unsafe string.',
      { value },
    );
  }

  return collapseLexicalPath(separatorNormalizedValue);
}

function normalizeUrlLocationValue(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CodeArtifactDeclarationError(
      'artifact_location_value_invalid',
      'declare_artifact url location.value must be a valid HTTP(S) URL.',
      { value },
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CodeArtifactDeclarationError(
      'artifact_location_value_invalid',
      'declare_artifact url location.value must use http or https.',
      { protocol: url.protocol },
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new CodeArtifactDeclarationError(
      'artifact_url_credentials_not_allowed',
      'declare_artifact url location.value must not include credentials.',
    );
  }

  return url.toString();
}

function normalizeInlineSummaryLocationValue(value: string): string {
  const normalizedValue = value.trim();
  const bytes = Buffer.byteLength(normalizedValue, 'utf8');
  if (bytes > CODE_ARTIFACT_INLINE_SUMMARY_MAX_BYTES) {
    throw new CodeArtifactDeclarationError(
      'artifact_inline_summary_too_large',
      'declare_artifact inline_summary location.value exceeds the size limit.',
      {
        maxBytes: CODE_ARTIFACT_INLINE_SUMMARY_MAX_BYTES,
        actualBytes: bytes,
      },
    );
  }

  return normalizedValue;
}

function normalizeExternalRefLocationValue(value: string): string {
  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new CodeArtifactDeclarationError(
      'artifact_external_ref_invalid',
      'declare_artifact external_ref location.value must use <refKind>:<refId>.',
      { value },
    );
  }

  const refKind = value.slice(0, separatorIndex).trim();
  const refId = value.slice(separatorIndex + 1).trim();
  if (!CODE_ARTIFACT_EXTERNAL_REF_KINDS.includes(
    refKind as (typeof CODE_ARTIFACT_EXTERNAL_REF_KINDS)[number],
  )) {
    throw new CodeArtifactDeclarationError(
      'artifact_external_ref_kind_not_allowed',
      'declare_artifact external_ref location.value uses a non-allowlisted ref kind.',
      {
        refKind,
        allowedRefKinds: CODE_ARTIFACT_EXTERNAL_REF_KINDS,
      },
    );
  }
  if (refId.trim() === '') {
    throw new CodeArtifactDeclarationError(
      'artifact_external_ref_invalid',
      'declare_artifact external_ref location.value must include a non-empty ref id.',
      { value },
    );
  }

  return `${refKind}:${refId}`;
}

function isMeaningfulDisallowedFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return normalizeOptionalString(value) !== undefined;
  }
  return true;
}

function isUrlLikeLocalPath(value: string): boolean {
  if (/^[a-zA-Z]:\//.test(value)) {
    return false;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function collapseLexicalPath(value: string): string {
  const hasDrivePrefix = /^[a-zA-Z]:\//.test(value);
  const isAbsolute = hasDrivePrefix || value.startsWith('/');
  const drivePrefix = hasDrivePrefix ? value.slice(0, 2) : '';
  const body = hasDrivePrefix
    ? value.slice(2)
    : value.startsWith('/')
      ? value.slice(1)
      : value;
  const segments: string[] = [];

  for (const segment of body.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      const previous = segments.at(-1);
      if (previous !== undefined && previous !== '..') {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  if (hasDrivePrefix) {
    return segments.length > 0
      ? `${drivePrefix}/${segments.join('/')}`
      : `${drivePrefix}/`;
  }
  if (isAbsolute) {
    return segments.length > 0 ? `/${segments.join('/')}` : '/';
  }
  return segments.length > 0 ? segments.join('/') : '.';
}

function assertLocationCrossFieldRules(
  location: CodeArtifactLocation,
  summary: string | undefined,
  metadata: CoreRecordMetadata | undefined,
): void {
  if (
    location.kind === 'none' &&
    summary === undefined &&
    (metadata === undefined || Object.keys(metadata).length === 0)
  ) {
    throw new CodeArtifactDeclarationError(
      'artifact_location_evidence_required',
      'declare_artifact location.kind none requires summary or metadata evidence.',
    );
  }
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  if (!isRecord(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

function isJsonSerializable(input: unknown): boolean {
  return isJsonValue(input, new Set());
}

function isJsonValue(input: unknown, seen: Set<object>): boolean {
  if (
    input === null ||
    typeof input === 'string' ||
    typeof input === 'boolean'
  ) {
    return true;
  }
  if (typeof input === 'number') {
    return Number.isFinite(input);
  }
  if (Array.isArray(input)) {
    if (seen.has(input)) {
      return false;
    }
    seen.add(input);
    const ok = input.every((item) => isJsonValue(item, seen));
    seen.delete(input);
    return ok;
  }
  if (isPlainRecord(input)) {
    if (seen.has(input)) {
      return false;
    }
    seen.add(input);
    const ok = Object.values(input).every((value) =>
      value !== undefined && isJsonValue(value, seen));
    seen.delete(input);
    return ok;
  }

  return false;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
