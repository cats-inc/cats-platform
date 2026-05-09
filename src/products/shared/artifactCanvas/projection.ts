import { createHash } from 'node:crypto';

import type {
  CatsCoreState,
  CoreArtifactRecord,
  CoreRecordMetadata,
} from '../../../core/types.js';
import {
  canvasSurfaceRouteRegistry,
  type ArtifactCanvasError,
  type ArtifactCanvasPresentationInput,
  type ArtifactCanvasProjection,
  type CanvasSurfaceRef,
} from './contracts.js';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  buildArtifactCanvasPolicyVersion,
  resolveArtifactCanvasIframePolicy,
  type ArtifactCanvasPolicyConfig,
  type ArtifactCanvasProducerIdentity,
  type ArtifactCanvasSupervisorPreviewLeaseStore,
} from './iframePolicy.js';

export type ArtifactCanvasProjectionResult =
  | {
      status: 'ok';
      statusCode: 200;
      projection: ArtifactCanvasProjection;
    }
  | {
      status: 'error';
      statusCode: 404 | 422;
      error: ArtifactCanvasError;
    };

export function buildArtifactCanvasProjection(input: {
  core: CatsCoreState;
  surface: CanvasSurfaceRef;
  artifactId: string;
  presentationRequested?: ArtifactCanvasPresentationInput;
  policyConfig?: ArtifactCanvasPolicyConfig;
  supervisorPreviewLeaseStore?: ArtifactCanvasSupervisorPreviewLeaseStore | null;
}): ArtifactCanvasProjectionResult {
  const presentationRequested = input.presentationRequested ?? 'auto';
  const policyConfig = input.policyConfig ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG;
  const artifact = input.core.artifacts.find((candidate) =>
    candidate.id === input.artifactId) ?? null;
  if (!artifact) {
    return errorResult(404, {
      code: 'artifact_canvas_artifact_not_found',
      message: `No artifact found for id ${input.artifactId}.`,
    });
  }
  if (artifact.status === 'archived') {
    return errorResult(422, {
      code: 'artifact_canvas_artifact_not_canvas_eligible',
      message: 'Archived artifacts are not canvas-eligible.',
      details: { artifactId: artifact.id },
    });
  }
  if (!isArtifactAnchoredToSurface(artifact, input.surface)) {
    return errorResult(422, {
      code: 'artifact_canvas_artifact_not_anchored',
      message: 'Artifact is not anchored to the requested canvas surface.',
      details: {
        artifactId: artifact.id,
        surface: input.surface,
      },
    });
  }

  const safeUrl = resolveArtifactCanvasSafeUrl(artifact);
  const textContent = resolveArtifactCanvasTextContent(artifact);
  const producer = resolveArtifactCanvasProducer(artifact);
  const policy = safeUrl
    ? resolveArtifactCanvasIframePolicy({
        url: safeUrl,
        artifact,
        artifactKind: artifact.kind,
        producer,
        config: policyConfig,
        supervisorPreviewLeaseStore: input.supervisorPreviewLeaseStore,
      })
    : null;
  const policyVersion = policy?.policyVersion
    ?? buildArtifactCanvasPolicyVersion(policyConfig).policyVersion;
  if (policy?.status === 'rejected') {
    return errorResult(422, policy.error);
  }

  const resolvedPresentation = resolveProjectionPresentation({
    artifact,
    safeUrl,
    textContent,
    presentationRequested,
  });
  if (resolvedPresentation === null) {
    return errorResult(422, {
      code: 'artifact_canvas_presentation_unsupported',
      message: 'Artifact cannot be rendered with the requested presentation.',
      details: {
        artifactId: artifact.id,
        presentationRequested,
      },
    });
  }

  return {
    status: 'ok',
    statusCode: 200,
    projection: {
      surface: input.surface,
      artifact: {
        id: artifact.id,
        title: artifact.title,
        kind: artifact.kind,
        status: artifact.status,
        summary: artifact.summary,
        path: artifact.path,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        updatedAt: artifact.updatedAt,
      },
      presentationRequested,
      presentationResolved: resolvedPresentation,
      iframeSandboxProfile:
        safeUrl
        && policy?.status === 'accepted'
        && resolvedPresentation !== 'code'
        ? policy.profile
        : null,
      safeUrl,
      externalUrl: safeUrl,
      textContent,
      policyVersion,
      error: resolvedPresentation === 'unsupported'
        ? {
            code: 'artifact_canvas_presentation_unsupported',
            message: 'Artifact has no safe inline presentation target yet.',
          }
        : null,
    },
  };
}

export function isArtifactAnchoredToSurface(
  artifact: CoreArtifactRecord,
  surface: CanvasSurfaceRef,
): boolean {
  switch (surface.kind) {
    case 'code_task':
    case 'work_task':
      return artifact.taskId === surface.surfaceId;
    case 'work_item':
      return artifact.workItemId === surface.surfaceId;
    case 'work_project':
      return artifact.projectId === surface.surfaceId;
    case 'chat_conversation':
      return artifact.conversationId === surface.surfaceId;
    case 'code_codespace':
      return resolveArtifactCodespaceId(artifact) === surface.surfaceId;
    default: {
      const exhaustive: never = surface.kind;
      return exhaustive;
    }
  }
}

export function resolveArtifactCanvasSafeUrl(artifact: CoreArtifactRecord): string | null {
  const declaration = readCodeArtifactDeclarationMetadata(artifact.metadata);
  const location = asRecord(declaration?.location);
  const locationKind = readNonEmptyString(location?.kind);
  const locationValue = readNonEmptyString(location?.value);
  if (locationKind === 'url' && isHttpUrl(locationValue)) {
    return locationValue;
  }
  if (isHttpUrl(artifact.path)) {
    return artifact.path;
  }
  return null;
}

export function resolveArtifactCanvasTextContent(
  artifact: CoreArtifactRecord,
): string | null {
  const declaration = readCodeArtifactDeclarationMetadata(artifact.metadata);
  const location = asRecord(declaration?.location);
  const locationKind = readNonEmptyString(location?.kind);
  const locationValue = readNonEmptyString(location?.value);
  if (locationKind === 'inline_summary' && locationValue) {
    return locationValue;
  }
  return null;
}

export function resolveArtifactCanvasProjectionApiPath(input: {
  surface: CanvasSurfaceRef;
  artifactId: string;
  presentationRequested?: ArtifactCanvasPresentationInput;
}): string {
  return canvasSurfaceRouteRegistry.projectionApiUrl(
    input.surface,
    input.artifactId,
    input.presentationRequested ?? 'auto',
  );
}

function resolveProjectionPresentation(input: {
  artifact: CoreArtifactRecord;
  safeUrl: string | null;
  textContent: string | null;
  presentationRequested: ArtifactCanvasPresentationInput;
}): ArtifactCanvasProjection['presentationResolved'] | null {
  if (input.presentationRequested === 'auto') {
    if (input.safeUrl && isImagePresentationArtifact(input.artifact, input.safeUrl)) {
      return 'image';
    }
    if (input.safeUrl && isPdfPresentationArtifact(input.artifact, input.safeUrl)) {
      return 'pdf';
    }
    if (isCodePresentationArtifact(input.artifact, input.safeUrl, input.textContent)) {
      return 'code';
    }
    return input.safeUrl ? 'iframe' : 'unsupported';
  }
  if (input.presentationRequested === 'iframe') {
    return input.safeUrl ? 'iframe' : null;
  }
  if (input.presentationRequested === 'image') {
    return input.safeUrl && isImagePresentationArtifact(input.artifact, input.safeUrl)
      ? 'image'
      : null;
  }
  if (input.presentationRequested === 'pdf') {
    return input.safeUrl && isPdfPresentationArtifact(input.artifact, input.safeUrl)
      ? 'pdf'
      : null;
  }
  if (input.presentationRequested === 'code') {
    return isCodePresentationArtifact(input.artifact, input.safeUrl, input.textContent)
      ? 'code'
      : null;
  }
  return null;
}

function isImagePresentationArtifact(
  artifact: CoreArtifactRecord,
  safeUrl: string,
): boolean {
  return artifact.mimeType?.startsWith('image/') === true
    || hasPathExtension(safeUrl, [
      '.avif',
      '.bmp',
      '.gif',
      '.jpeg',
      '.jpg',
      '.png',
      '.svg',
      '.webp',
    ]);
}

function isPdfPresentationArtifact(
  artifact: CoreArtifactRecord,
  safeUrl: string,
): boolean {
  return artifact.mimeType === 'application/pdf'
    || hasPathExtension(safeUrl, ['.pdf']);
}

function isCodePresentationArtifact(
  artifact: CoreArtifactRecord,
  safeUrl: string | null,
  textContent: string | null,
): boolean {
  return textContent !== null
    || isCodeMimeType(artifact.mimeType)
    || (safeUrl
      ? hasPathExtension(safeUrl, [
          '.css',
          '.csv',
          '.diff',
          '.html',
          '.js',
          '.json',
          '.log',
          '.md',
          '.patch',
          '.ts',
          '.tsx',
          '.txt',
          '.xml',
          '.yaml',
          '.yml',
        ])
      : false);
}

function isCodeMimeType(mimeType: string | null): boolean {
  return mimeType?.startsWith('text/') === true
    || mimeType === 'application/json'
    || mimeType === 'application/xml';
}

function hasPathExtension(safeUrl: string, extensions: string[]): boolean {
  try {
    const pathname = new URL(safeUrl).pathname.toLowerCase();
    return extensions.some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}

function resolveArtifactCanvasProducer(
  artifact: CoreArtifactRecord,
): ArtifactCanvasProducerIdentity {
  const declaration = readCodeArtifactDeclarationMetadata(artifact.metadata);
  const idempotency = asRecord(declaration?.idempotency);
  const producerKind =
    readNonEmptyString(idempotency?.producerKind)
    ?? readNonEmptyString(declaration?.producerKind);
  return {
    kind: isArtifactCanvasProducerKind(producerKind) ? producerKind : 'agent',
    producerIdentity:
      readNonEmptyString(idempotency?.producerIdentity)
      ?? readNonEmptyString(declaration?.producerIdentity),
  };
}

function resolveArtifactCodespaceId(artifact: CoreArtifactRecord): string | null {
  const declaration = readCodeArtifactDeclarationMetadata(artifact.metadata);
  const anchors = asRecord(declaration?.anchors);
  const workspacePath = readNonEmptyString(anchors?.workspacePath);
  if (!workspacePath) {
    return null;
  }
  const normalized = workspacePath.trim().replace(/\\/g, '/');
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `codespace-${digest}`;
}

function readCodeArtifactDeclarationMetadata(
  metadata: CoreRecordMetadata,
): Record<string, unknown> | null {
  return asRecord(metadata.codeArtifactDeclaration);
}

function errorResult(
  statusCode: 404 | 422,
  error: ArtifactCanvasError,
): ArtifactCanvasProjectionResult {
  return {
    status: 'error',
    statusCode,
    error,
  };
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isArtifactCanvasProducerKind(
  value: string | null,
): value is ArtifactCanvasProducerIdentity['kind'] {
  return value === 'agent'
    || value === 'tool'
    || value === 'system'
    || value === 'user';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
