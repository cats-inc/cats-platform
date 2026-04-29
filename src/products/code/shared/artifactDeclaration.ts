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

export type CodeArtifactProducerLabel =
  | 'preview_url'
  | 'build_output'
  | 'test_report'
  | 'review_report'
  | 'implementation_summary'
  | 'diff_summary'
  | 'changed_files_summary'
  | 'patch_bundle'
  | 'screenshot'
  | 'wireframe'
  | 'spec_document'
  | 'plan_document'
  | 'transcript_export'
  | 'dataset_file';

export interface CodeArtifactLocation {
  kind: CodeArtifactLocationKind;
  value?: string | null;
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

export type CodeArtifactToolResult =
  | {
      status: 'accepted';
      declarationId: string;
      artifactId?: string | null;
      disposition?: CodeArtifactDisposition;
    }
  | {
      status: 'rejected';
      error: {
        code: CodeArtifactDeclarationErrorCode;
        message: string;
        details?: unknown;
      };
    };

export type CodeArtifactDeclarationErrorCode =
  | 'artifact_required_field_empty'
  | 'artifact_location_kind_invalid'
  | 'artifact_location_required'
  | 'artifact_location_value_required'
  | 'artifact_metadata_invalid'
  | 'artifact_producer_field_not_allowed';

const AGENT_VISIBLE_TOOL_FIELDS = new Set([
  'declarationId',
  'label',
  'title',
  'location',
  'summary',
  'metadata',
]);

export const CODE_ARTIFACT_LABEL_MAPPINGS: readonly CodeArtifactLabelMapping[] = [
  {
    label: 'preview_url',
    coreKind: 'preview',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'build_output',
    coreKind: 'build',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'test_report',
    coreKind: 'report',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'review_report',
    coreKind: 'report',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'implementation_summary',
    coreKind: 'report',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'diff_summary',
    coreKind: 'report',
    defaultStatus: 'draft',
    defaultDisposition: 'candidate',
  },
  {
    label: 'changed_files_summary',
    coreKind: 'report',
    defaultStatus: 'draft',
    defaultDisposition: 'candidate',
  },
  {
    label: 'patch_bundle',
    coreKind: 'attachment',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'screenshot',
    coreKind: 'attachment',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'wireframe',
    coreKind: 'document',
    defaultStatus: 'draft',
    defaultDisposition: 'record',
  },
  {
    label: 'spec_document',
    coreKind: 'document',
    defaultStatus: 'draft',
    defaultDisposition: 'record',
  },
  {
    label: 'plan_document',
    coreKind: 'document',
    defaultStatus: 'draft',
    defaultDisposition: 'record',
  },
  {
    label: 'transcript_export',
    coreKind: 'transcript_export',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
  {
    label: 'dataset_file',
    coreKind: 'dataset',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  },
];

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

  accepted(input: {
    declarationId: string;
    artifactId?: string | null;
    disposition?: CodeArtifactDisposition;
  }): CodeArtifactToolResult {
    return {
      status: 'accepted',
      declarationId: input.declarationId,
      artifactId: input.artifactId ?? null,
      disposition: input.disposition,
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

  const disallowedFields = Object.entries(input)
    .filter(([key, value]) =>
      !AGENT_VISIBLE_TOOL_FIELDS.has(key) && value !== null && value !== undefined)
    .map(([key]) => key);
  if (disallowedFields.length > 0) {
    throw new CodeArtifactDeclarationError(
      'artifact_producer_field_not_allowed',
      'declare_artifact input includes server-resolved fields.',
      { fields: disallowedFields.sort() },
    );
  }

  const declarationId = readRequiredString(input.declarationId, 'declarationId');
  const label = readRequiredString(input.label, 'label');
  const title = readRequiredString(input.title, 'title');
  const location = normalizeCodeArtifactLocation(input.location);
  const summary = normalizeOptionalString(input.summary);
  const metadata = normalizeCodeArtifactMetadata(input.metadata);

  return {
    declarationId,
    label,
    title,
    location,
    ...(summary !== undefined ? { summary } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

export function resolveCodeArtifactLabelMapping(label: string): CodeArtifactLabelMapping {
  const normalizedLabel = label.trim();
  return CODE_ARTIFACT_LABEL_MAPPINGS.find((mapping) => mapping.label === normalizedLabel) ?? {
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

  return {
    kind,
    ...(value !== undefined ? { value } : {}),
  };
}

function normalizeCodeArtifactMetadata(input: unknown): CoreRecordMetadata | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!isRecord(input)) {
    throw new CodeArtifactDeclarationError(
      'artifact_metadata_invalid',
      'declare_artifact metadata must be an object when provided.',
    );
  }
  return structuredClone(input);
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

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
