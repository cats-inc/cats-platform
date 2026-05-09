import type { CoreArtifactKind } from '../../../core/types.js';

export const ARTIFACT_CANVAS_SURFACE_KINDS = [
  'code_task',
  'code_codespace',
  'work_item',
  'work_project',
  'work_task',
  'chat_conversation',
] as const;

export type CanvasSurfaceKind = (typeof ARTIFACT_CANVAS_SURFACE_KINDS)[number];

export interface CanvasSurfaceRef {
  kind: CanvasSurfaceKind;
  surfaceId: string;
}

export const ARTIFACT_CANVAS_INPUT_PRESENTATIONS = [
  'auto',
  'iframe',
  'image',
  'pdf',
  'code',
] as const;

export const ARTIFACT_CANVAS_RESOLVED_PRESENTATIONS = [
  ...ARTIFACT_CANVAS_INPUT_PRESENTATIONS,
  'unsupported',
] as const;

export type ArtifactCanvasPresentationInput =
  (typeof ARTIFACT_CANVAS_INPUT_PRESENTATIONS)[number];
export type ArtifactCanvasResolvedPresentation =
  (typeof ARTIFACT_CANVAS_RESOLVED_PRESENTATIONS)[number];

export const ARTIFACT_CANVAS_SHOW_TOOL_NAME = 'show_in_canvas' as const;
export const ARTIFACT_CANVAS_CLEAR_TOOL_NAME = 'clear_canvas' as const;
export const ARTIFACT_CANVAS_TOOL_SCHEMA_VERSION = '1.0' as const;
export const ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH =
  '/api/canvas/intents/stream' as const;
export const ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH =
  '/api/canvas/intents/ack' as const;

export const ARTIFACT_CANVAS_SHOW_TOOL_DEFINITION = {
  name: ARTIFACT_CANVAS_SHOW_TOOL_NAME,
  schemaVersion: ARTIFACT_CANVAS_TOOL_SCHEMA_VERSION,
  description: [
    'Open a canvas-eligible artifact in the active product surface Artifact Canvas.',
    'Pass exactly one of artifactId or declarationId.',
    'Use presentation auto unless the user or artifact type requires iframe, image, pdf, or code.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      artifactId: { type: ['string', 'null'], minLength: 1 },
      declarationId: { type: ['string', 'null'], minLength: 1 },
      presentation: {
        type: ['string', 'null'],
        enum: ARTIFACT_CANVAS_INPUT_PRESENTATIONS,
      },
    },
    oneOf: [
      { required: ['artifactId'] },
      { required: ['declarationId'] },
    ],
  },
} as const;

export const ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION = {
  name: ARTIFACT_CANVAS_CLEAR_TOOL_NAME,
  schemaVersion: ARTIFACT_CANVAS_TOOL_SCHEMA_VERSION,
  description: 'Clear the active product surface Artifact Canvas by navigating back to the parent surface.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {},
    required: [],
  },
} as const;

export const ARTIFACT_CANVAS_TOOL_DEFINITIONS = [
  ARTIFACT_CANVAS_SHOW_TOOL_DEFINITION,
  ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION,
] as const;

export type ArtifactCanvasErrorCode =
  | 'artifact_canvas_required_field_empty'
  | 'artifact_canvas_identity_ambiguous'
  | 'artifact_canvas_identity_required'
  | 'artifact_canvas_presentation_invalid'
  | 'artifact_canvas_presentation_unsupported'
  | 'artifact_canvas_no_active_surface'
  | 'artifact_canvas_artifact_not_found'
  | 'artifact_canvas_artifact_not_canvas_eligible'
  | 'artifact_canvas_artifact_not_anchored'
  | 'artifact_canvas_declaration_unknown'
  | 'artifact_canvas_declaration_producer_mismatch'
  | 'artifact_canvas_declaration_collision'
  | 'artifact_canvas_iframe_scheme_rejected'
  | 'artifact_canvas_url_credentials_not_allowed'
  | 'artifact_canvas_policy_config_invalid';

export interface ArtifactCanvasError {
  code: ArtifactCanvasErrorCode;
  message: string;
  details?: unknown;
}

export type ArtifactCanvasToolIdentity =
  | { kind: 'artifact'; artifactId: string }
  | { kind: 'declaration'; declarationId: string };

export interface ArtifactCanvasShowToolInput {
  artifactId?: string | null;
  declarationId?: string | null;
  presentation?: ArtifactCanvasPresentationInput | null;
}

export interface ArtifactCanvasClearToolInput {
  presentation?: never;
}

export interface NormalizedArtifactCanvasShowToolInput {
  identity: ArtifactCanvasToolIdentity;
  presentation: ArtifactCanvasPresentationInput;
}

export interface NormalizedArtifactCanvasClearToolInput {
  action: 'clear_canvas';
}

export type ArtifactCanvasToolShapeResult<TInput> =
  | {
      status: 'shape_ok';
      input: TInput;
    }
  | {
      status: 'rejected';
      error: ArtifactCanvasError;
    };

export interface ArtifactCanvasToolAcceptedResultBase {
  status: 'accepted';
  activityId: string;
  targetUrl: string;
  policyVersion: string;
}

export interface ArtifactCanvasShowAcceptedResult
  extends ArtifactCanvasToolAcceptedResultBase {
  toolName: 'show_in_canvas';
  artifactId: string;
  presentationRequested: ArtifactCanvasPresentationInput;
  presentationResolved: ArtifactCanvasResolvedPresentation;
}

export interface ArtifactCanvasClearAcceptedResult
  extends ArtifactCanvasToolAcceptedResultBase {
  toolName: 'clear_canvas';
}

export type ArtifactCanvasToolResult =
  | ArtifactCanvasShowAcceptedResult
  | ArtifactCanvasClearAcceptedResult
  | {
      status: 'rejected';
      error: ArtifactCanvasError;
    };

export type CanvasSurfaceAnchorSource =
  | { source: 'activity_project_anchor'; surfaceKind: 'work_project'; projectId: string }
  | { source: 'activity_work_item_anchor'; surfaceKind: 'work_item'; workItemId: string }
  | { source: 'activity_task_anchor'; surfaceKind: 'code_task' | 'work_task'; taskId: string }
  | {
      source: 'activity_conversation_anchor';
      surfaceKind: 'chat_conversation';
      conversationId: string;
    }
  | { source: 'activity_metadata_anchor'; surfaceKind: 'code_codespace'; codespaceId: string };

export interface ArtifactCanvasProjection {
  surface: CanvasSurfaceRef;
  artifact: {
    id: string;
    title: string;
    kind: CoreArtifactKind;
    status: string;
    summary: string | null;
    path: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    updatedAt: string;
  };
  presentationRequested: ArtifactCanvasPresentationInput;
  presentationResolved: ArtifactCanvasResolvedPresentation;
  iframeSandboxProfile: ArtifactCanvasIframeSandboxProfile | null;
  safeUrl: string | null;
  externalUrl: string | null;
  policyVersion: string;
  error: ArtifactCanvasError | null;
}

export type ArtifactCanvasIframeSandboxProfileName =
  | 'static'
  | 'scripted-cross-origin';

export interface ArtifactCanvasIframeSandboxProfile {
  name: ArtifactCanvasIframeSandboxProfileName;
  sandbox: string;
  referrerPolicy: 'no-referrer';
  allow: string;
}

export interface ArtifactCanvasNavigateIntent {
  intentId: string;
  activityId: string;
  surface: CanvasSurfaceRef;
  targetUrl: string;
  artifactId: string | null;
  presentationRequested: ArtifactCanvasPresentationInput | null;
  policyVersion: string;
  triggeredAt: string;
  expiresAt: string;
}

export interface CanvasParentUrlParse {
  kind: 'parent';
  surface: CanvasSurfaceRef;
  parentUrl: string;
}

export interface CanvasArtifactUrlParse {
  kind: 'canvas';
  surface: CanvasSurfaceRef;
  parentUrl: string;
  canvasUrl: string;
  artifactId: string;
  presentationRequested: ArtifactCanvasPresentationInput;
}

export type CanvasUrlParse = CanvasParentUrlParse | CanvasArtifactUrlParse;

const SURFACE_ROUTE_PREFIXES: Record<CanvasSurfaceKind, string> = {
  code_task: '/code/tasks',
  code_codespace: '/code/codespaces',
  work_item: '/work/items',
  work_project: '/work/projects',
  work_task: '/work/tasks',
  chat_conversation: '/chat/conversations',
};

export interface CanvasSurfaceRouteRegistry {
  parentUrl(surface: CanvasSurfaceRef): string;
  canvasUrl(
    surface: CanvasSurfaceRef,
    artifactId: string,
    presentation?: ArtifactCanvasPresentationInput,
  ): string;
  projectionApiUrl(
    surface: CanvasSurfaceRef,
    artifactId: string,
    presentation?: ArtifactCanvasPresentationInput,
  ): string;
  parse(pathname: string): CanvasUrlParse | null;
  parseProjectionApiPath(pathname: string): CanvasArtifactUrlParse | null;
}

export const canvasSurfaceRouteRegistry: CanvasSurfaceRouteRegistry = {
  parentUrl(surface) {
    return composeParentUrl(surface);
  },
  canvasUrl(surface, artifactId, presentation = 'auto') {
    return composeCanvasUrl(surface, artifactId, presentation);
  },
  projectionApiUrl(surface, artifactId, presentation = 'auto') {
    return composeProjectionApiUrl(surface, artifactId, presentation);
  },
  parse(pathname) {
    return parseCanvasSurfacePath(pathname);
  },
  parseProjectionApiPath(pathname) {
    return parseCanvasProjectionApiPath(pathname);
  },
};

export function buildArtifactCanvasRenderIntentStreamUrl(surface: CanvasSurfaceRef): string {
  assertCanvasSurface(surface);
  const params = new URLSearchParams({
    surfaceKind: surface.kind,
    surfaceId: surface.surfaceId,
  });
  return `${ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH}?${params.toString()}`;
}

export function normalizeArtifactCanvasShowToolInput(
  input: unknown,
  activeSurface?: CanvasSurfaceRef | null,
): ArtifactCanvasToolShapeResult<NormalizedArtifactCanvasShowToolInput> {
  const activeSurfaceError = assertActiveSurface(activeSurface);
  if (activeSurfaceError) {
    return activeSurfaceError;
  }
  if (!isRecord(input)) {
    return rejected(
      'artifact_canvas_required_field_empty',
      'show_in_canvas input must be an object.',
    );
  }

  const artifactId = normalizeNonEmptyString(input.artifactId);
  const declarationId = normalizeNonEmptyString(input.declarationId);
  if (artifactId && declarationId) {
    return rejected(
      'artifact_canvas_identity_ambiguous',
      'show_in_canvas accepts exactly one of artifactId or declarationId.',
    );
  }
  if (!artifactId && !declarationId) {
    return rejected(
      'artifact_canvas_identity_required',
      'show_in_canvas requires artifactId or declarationId.',
    );
  }

  const presentation = input.presentation === undefined || input.presentation === null
    ? 'auto'
    : normalizeNonEmptyString(input.presentation);
  if (!isArtifactCanvasInputPresentation(presentation)) {
    return rejected(
      'artifact_canvas_presentation_invalid',
      'show_in_canvas presentation is invalid.',
      { presentation },
    );
  }

  return {
    status: 'shape_ok',
    input: {
      identity: artifactId
        ? { kind: 'artifact', artifactId }
        : { kind: 'declaration', declarationId: declarationId! },
      presentation,
    },
  };
}

export function normalizeArtifactCanvasClearToolInput(
  input: unknown,
  activeSurface?: CanvasSurfaceRef | null,
): ArtifactCanvasToolShapeResult<NormalizedArtifactCanvasClearToolInput> {
  const activeSurfaceError = assertActiveSurface(activeSurface);
  if (activeSurfaceError) {
    return activeSurfaceError;
  }
  if (input !== undefined && input !== null && !isRecord(input)) {
    return rejected(
      'artifact_canvas_required_field_empty',
      'clear_canvas input must be an object when provided.',
    );
  }
  return {
    status: 'shape_ok',
    input: { action: 'clear_canvas' },
  };
}

export function composeArtifactCanvasNavigateIntent(input: {
  intentId: string;
  activityId: string;
  surface: CanvasSurfaceRef;
  artifactId: string | null;
  presentationRequested: ArtifactCanvasPresentationInput | null;
  policyVersion: string;
  triggeredAt: string;
  ttlMs?: number;
}): ArtifactCanvasNavigateIntent {
  const ttlMs = input.ttlMs ?? 30_000;
  const targetUrl = input.artifactId
    ? composeCanvasUrl(input.surface, input.artifactId, input.presentationRequested ?? 'auto')
    : composeParentUrl(input.surface);
  return {
    intentId: input.intentId,
    activityId: input.activityId,
    surface: input.surface,
    targetUrl,
    artifactId: input.artifactId,
    presentationRequested: input.presentationRequested,
    policyVersion: input.policyVersion,
    triggeredAt: input.triggeredAt,
    expiresAt: new Date(new Date(input.triggeredAt).getTime() + ttlMs).toISOString(),
  };
}

function composeParentUrl(surface: CanvasSurfaceRef): string {
  assertCanvasSurface(surface);
  return `${SURFACE_ROUTE_PREFIXES[surface.kind]}/${encodeURIComponent(surface.surfaceId)}`;
}

function composeCanvasUrl(
  surface: CanvasSurfaceRef,
  artifactId: string,
  presentation: ArtifactCanvasPresentationInput = 'auto',
): string {
  assertCanvasSurface(surface);
  const normalizedArtifactId = normalizeRequiredPathToken(artifactId, 'artifactId');
  const parent = composeParentUrl(surface);
  const base = `${parent}/canvas/${encodeURIComponent(normalizedArtifactId)}`;
  return presentation === 'auto'
    ? base
    : `${base}/view/${presentation}`;
}

function composeProjectionApiUrl(
  surface: CanvasSurfaceRef,
  artifactId: string,
  presentation: ArtifactCanvasPresentationInput = 'auto',
): string {
  assertCanvasSurface(surface);
  const normalizedArtifactId = normalizeRequiredPathToken(artifactId, 'artifactId');
  const base = `/api/canvas/${encodeURIComponent(surface.kind)}/${encodeURIComponent(
    surface.surfaceId,
  )}/artifacts/${encodeURIComponent(normalizedArtifactId)}`;
  return presentation === 'auto'
    ? base
    : `${base}/view/${presentation}`;
}

function parseCanvasSurfacePath(pathname: string): CanvasUrlParse | null {
  const segments = splitPath(pathname);
  for (const surfaceKind of ARTIFACT_CANVAS_SURFACE_KINDS) {
    const prefixSegments = splitPath(SURFACE_ROUTE_PREFIXES[surfaceKind]);
    if (!startsWithSegments(segments, prefixSegments)) {
      continue;
    }
    const surfaceId = segments[prefixSegments.length];
    if (!surfaceId || segments.length < prefixSegments.length + 1) {
      continue;
    }
    const surface = { kind: surfaceKind, surfaceId: decodeURIComponent(surfaceId) };
    const parentUrl = composeParentUrl(surface);
    if (segments.length === prefixSegments.length + 1) {
      return { kind: 'parent', surface, parentUrl };
    }
    if (segments[prefixSegments.length + 1] !== 'canvas') {
      continue;
    }
    return parseCanvasTail({
      surface,
      parentUrl,
      tail: segments.slice(prefixSegments.length + 2),
      composeCanvas: true,
    });
  }
  return null;
}

function parseCanvasProjectionApiPath(pathname: string): CanvasArtifactUrlParse | null {
  const segments = splitPath(pathname);
  if (
    segments.length !== 6
    && segments.length !== 8
  ) {
    return null;
  }
  if (segments[0] !== 'api' || segments[1] !== 'canvas' || segments[4] !== 'artifacts') {
    return null;
  }
  const surfaceKind = decodeURIComponent(segments[2] ?? '');
  if (!isCanvasSurfaceKind(surfaceKind)) {
    return null;
  }
  const surfaceId = segments[3];
  if (!surfaceId) {
    return null;
  }
  const surface = { kind: surfaceKind, surfaceId: decodeURIComponent(surfaceId) };
  const parentUrl = composeParentUrl(surface);
  return parseCanvasTail({
    surface,
    parentUrl,
    tail: segments.slice(5),
    composeCanvas: false,
  });
}

function parseCanvasTail(input: {
  surface: CanvasSurfaceRef;
  parentUrl: string;
  tail: string[];
  composeCanvas: boolean;
}): CanvasArtifactUrlParse | null {
  const artifactId = input.tail[0];
  if (!artifactId) {
    return null;
  }
  let presentationRequested: ArtifactCanvasPresentationInput = 'auto';
  if (input.tail.length === 3) {
    if (input.tail[1] !== 'view' || !isArtifactCanvasInputPresentation(input.tail[2])) {
      return null;
    }
    presentationRequested = input.tail[2];
  } else if (input.tail.length !== 1) {
    return null;
  }

  return {
    kind: 'canvas',
    surface: input.surface,
    parentUrl: input.parentUrl,
    canvasUrl: input.composeCanvas
      ? composeCanvasUrl(input.surface, decodeURIComponent(artifactId), presentationRequested)
      : composeProjectionApiUrl(
        input.surface,
        decodeURIComponent(artifactId),
        presentationRequested,
      ),
    artifactId: decodeURIComponent(artifactId),
    presentationRequested,
  };
}

function assertActiveSurface(
  surface: CanvasSurfaceRef | null | undefined,
): ArtifactCanvasToolShapeResult<never> | null {
  if (!surface) {
    return rejected(
      'artifact_canvas_no_active_surface',
      'Artifact Canvas tools require an active product surface.',
    );
  }
  try {
    assertCanvasSurface(surface);
  } catch (error) {
    return rejected(
      'artifact_canvas_no_active_surface',
      error instanceof Error ? error.message : 'Active surface is invalid.',
    );
  }
  return null;
}

function assertCanvasSurface(surface: CanvasSurfaceRef): void {
  if (!isCanvasSurfaceKind(surface.kind)) {
    throw new Error(`Unsupported canvas surface kind: ${surface.kind}`);
  }
  normalizeRequiredPathToken(surface.surfaceId, 'surfaceId');
}

function normalizeRequiredPathToken(value: string, field: string): string {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  return normalized;
}

function isCanvasSurfaceKind(input: unknown): input is CanvasSurfaceKind {
  return ARTIFACT_CANVAS_SURFACE_KINDS.includes(input as CanvasSurfaceKind);
}

function isArtifactCanvasInputPresentation(
  input: unknown,
): input is ArtifactCanvasPresentationInput {
  return ARTIFACT_CANVAS_INPUT_PRESENTATIONS.includes(
    input as ArtifactCanvasPresentationInput,
  );
}

function splitPath(pathname: string): string[] {
  return pathname.split('?')[0]!.split('/').filter(Boolean);
}

function startsWithSegments(segments: readonly string[], prefix: readonly string[]): boolean {
  if (segments.length < prefix.length) {
    return false;
  }
  return prefix.every((segment, index) => segments[index] === segment);
}

function normalizeNonEmptyString(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rejected<TInput = never>(
  code: ArtifactCanvasErrorCode,
  message: string,
  details?: unknown,
): ArtifactCanvasToolShapeResult<TInput> {
  return {
    status: 'rejected',
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
