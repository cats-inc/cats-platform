import { createHash } from 'node:crypto';

import { upsertCoreArtifact } from '../../../core/model/planningRecords.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreArtifactRecord,
  CoreRecordMetadata,
} from '../../../core/types.js';
import {
  appendArtifactCanvasIntentActivity,
} from '../../shared/artifactCanvas/activity.js';
import {
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  type ArtifactCanvasError,
  type ArtifactCanvasNavigateIntent,
  type ArtifactCanvasPresentationInput,
  type CanvasSurfaceRef,
} from '../../shared/artifactCanvas/contracts.js';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  type ArtifactCanvasPolicyConfig,
  type ArtifactCanvasSupervisorPreviewLeaseStore,
} from '../../shared/artifactCanvas/iframePolicy.js';
import { buildArtifactCanvasProjection } from '../../shared/artifactCanvas/projection.js';
import {
  type ArtifactCanvasRenderIntentDeliveryResult,
  type ArtifactCanvasRenderIntentHub,
  createArtifactCanvasIntentId,
  getDefaultArtifactCanvasRenderIntentHub,
} from '../../shared/artifactCanvas/renderIntent.js';
import type { LivePreviewLease } from './contracts.js';

export const CODE_LIVE_PREVIEW_ARTIFACT_METADATA_SCHEMA_VERSION = '1.0' as const;
export const CODE_LIVE_PREVIEW_PRODUCER_TOOL_NAME =
  'cats_code_live_preview_supervisor' as const;
export const CODE_LIVE_PREVIEW_PRODUCER_IDENTITY =
  `tool:${CODE_LIVE_PREVIEW_PRODUCER_TOOL_NAME}` as const;

export type LivePreviewArtifactMaterializationSkippedReason =
  | 'lease_not_ready'
  | 'unsupported_surface';

export type LivePreviewArtifactMaterializationResult =
  | {
      status: 'materialized';
      core: CatsCoreState;
      artifact: CoreArtifactRecord;
      created: boolean;
      lease: LivePreviewLease;
    }
  | {
      status: 'skipped';
      reason: LivePreviewArtifactMaterializationSkippedReason;
      core: CatsCoreState;
      lease: LivePreviewLease;
    };

export interface LivePreviewArtifactMaterializationOptions {
  title?: string | null;
  summary?: string | null;
  now?: Date;
}

export type LivePreviewArtifactCanvasShowResult =
  | {
      status: 'shown';
      core: CatsCoreState;
      artifact: CoreArtifactRecord;
      activity: CoreActivityRecord;
      delivery: ArtifactCanvasRenderIntentDeliveryResult;
      intent: ArtifactCanvasNavigateIntent;
      lease: LivePreviewLease;
    }
  | {
      status: 'skipped';
      reason: LivePreviewArtifactMaterializationSkippedReason;
      core: CatsCoreState;
      lease: LivePreviewLease;
    }
  | {
      status: 'rejected';
      reason: 'artifact_canvas_projection_error';
      core: CatsCoreState;
      error: ArtifactCanvasError;
      lease: LivePreviewLease;
    };

export interface LivePreviewArtifactCanvasShowOptions
  extends LivePreviewArtifactMaterializationOptions {
  actorId?: string | null;
  intentIdFactory?: () => string;
  policyConfig?: ArtifactCanvasPolicyConfig;
  presentationRequested?: ArtifactCanvasPresentationInput;
  renderIntentHub?: ArtifactCanvasRenderIntentHub;
  supervisorPreviewLeaseStore?: ArtifactCanvasSupervisorPreviewLeaseStore | null;
  targetSessionId?: string | null;
}

interface ResolvedLivePreviewArtifactAnchors {
  conversationId: string | null;
  projectId: string | null;
  taskId: string | null;
  workItemId: string | null;
  workspacePath: string;
}

export function materializeLivePreviewArtifact(
  core: CatsCoreState,
  lease: LivePreviewLease,
  options: LivePreviewArtifactMaterializationOptions = {},
): LivePreviewArtifactMaterializationResult {
  if (lease.status !== 'ready') {
    return { status: 'skipped', reason: 'lease_not_ready', core, lease };
  }
  if (lease.surface.kind !== 'code_task' && lease.surface.kind !== 'code_codespace') {
    return { status: 'skipped', reason: 'unsupported_surface', core, lease };
  }

  const anchors = resolveLivePreviewArtifactAnchors(core, lease);
  const artifactId = buildLivePreviewArtifactId(lease.previewId);
  const declarationId = `live-preview:${lease.previewId}`;
  const metadata = buildLivePreviewArtifactMetadata({
    lease,
    declarationId,
    anchors,
    materialChangeSignature: buildMaterialChangeSignature(lease, anchors),
  });
  const result = upsertCoreArtifact(core, {
    id: artifactId,
    title: options.title?.trim() || `Live Preview (${lease.commandProfileId})`,
    kind: 'preview',
    status: 'ready',
    projectId: anchors.projectId,
    workItemId: anchors.workItemId,
    conversationId: anchors.conversationId,
    taskId: anchors.taskId,
    path: lease.origin,
    summary: options.summary?.trim() || `Supervised preview at ${lease.origin}.`,
    metadata,
  }, options.now ?? new Date());

  return {
    status: 'materialized',
    core: result.core,
    artifact: result.artifact,
    created: result.created,
    lease: {
      ...lease,
      artifactId: result.artifact.id,
    },
  };
}

export function materializeLivePreviewArtifactAndShowInCanvas(
  core: CatsCoreState,
  lease: LivePreviewLease,
  options: LivePreviewArtifactCanvasShowOptions = {},
): LivePreviewArtifactCanvasShowResult {
  const now = options.now ?? new Date();
  const materialized = materializeLivePreviewArtifact(core, lease, {
    title: options.title,
    summary: options.summary,
    now,
  });
  if (materialized.status === 'skipped') {
    return materialized;
  }

  const presentationRequested = options.presentationRequested ?? 'auto';
  const projection = buildArtifactCanvasProjection({
    core: materialized.core,
    surface: materialized.lease.surface,
    artifactId: materialized.artifact.id,
    presentationRequested,
    policyConfig: options.policyConfig ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    supervisorPreviewLeaseStore: createMaterializedLeaseStore(
      materialized.lease,
      options.supervisorPreviewLeaseStore,
    ),
  });
  if (projection.status === 'error') {
    return {
      status: 'rejected',
      reason: 'artifact_canvas_projection_error',
      core: materialized.core,
      error: projection.error,
      lease: materialized.lease,
    };
  }

  const targetUrl = canvasSurfaceRouteRegistry.canvasUrl(
    materialized.lease.surface,
    materialized.artifact.id,
    presentationRequested,
  );
  const activity = appendArtifactCanvasIntentActivity({
    core: materialized.core,
    kind: 'artifact_canvas_show_intent',
    surface: materialized.lease.surface,
    actorId: options.actorId ?? null,
    artifactId: materialized.artifact.id,
    targetUrl,
    policyVersion: projection.projection.policyVersion,
    presentationRequested,
    presentationResolved: projection.projection.presentationResolved,
    iframeSandboxProfile: projection.projection.iframeSandboxProfile,
    message: 'Live preview opened in Artifact Canvas.',
    metadata: {
      codeLivePreview: {
        previewId: materialized.lease.previewId,
        artifactId: materialized.artifact.id,
      },
    },
    now,
  });
  const intent = composeArtifactCanvasNavigateIntent({
    intentId: options.intentIdFactory?.() ?? createArtifactCanvasIntentId(),
    activityId: activity.activity.id,
    surface: materialized.lease.surface,
    artifactId: materialized.artifact.id,
    presentationRequested,
    policyVersion: projection.projection.policyVersion,
    triggeredAt: now.toISOString(),
  });
  const hub = options.renderIntentHub ?? getDefaultArtifactCanvasRenderIntentHub();
  const delivery = hub.publish({
    intent,
    targetSessionId: options.targetSessionId,
    now,
  });

  return {
    status: 'shown',
    core: activity.core,
    artifact: materialized.artifact,
    activity: activity.activity,
    delivery,
    intent,
    lease: materialized.lease,
  };
}

function resolveLivePreviewArtifactAnchors(
  core: CatsCoreState,
  lease: LivePreviewLease,
): ResolvedLivePreviewArtifactAnchors {
  const task = lease.surface.kind === 'code_task'
    ? core.tasks.find((candidate) => candidate.id === lease.surface.surfaceId) ?? null
    : null;
  const workItem = task
    ? core.workItems.find((candidate) => candidate.taskId === task.id) ?? null
    : null;
  return {
    conversationId: task?.conversationId ?? null,
    projectId: workItem?.projectId ?? null,
    taskId: task?.id ?? (lease.surface.kind === 'code_task' ? lease.surface.surfaceId : null),
    workItemId: workItem?.id ?? null,
    workspacePath: lease.workspaceRef.rootPath,
  };
}

function buildLivePreviewArtifactMetadata(input: {
  lease: LivePreviewLease;
  declarationId: string;
  anchors: ResolvedLivePreviewArtifactAnchors;
  materialChangeSignature: string;
}): CoreRecordMetadata {
  const idempotencyKey = hashStableJson({
    declarationId: input.declarationId,
    previewId: input.lease.previewId,
    producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
    scope: resolveLivePreviewArtifactScope(input.anchors),
  });
  return {
    codeArtifactDeclaration: {
      schemaVersion: '1.0',
      declarationId: input.declarationId,
      producerKind: 'tool',
      producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
      producerLabel: 'preview_url',
      disposition: 'record',
      candidate: false,
      location: { kind: 'url', value: input.lease.origin },
      anchors: {
        conversationId: input.anchors.conversationId,
        taskId: input.anchors.taskId,
        projectId: input.anchors.projectId,
        workItemId: input.anchors.workItemId,
        workspacePath: input.anchors.workspacePath,
      },
      materialChangeSignature: input.materialChangeSignature,
      idempotency: {
        key: idempotencyKey,
        producerKind: 'tool',
        producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
        producerRuntimeSessionId: null,
        ...resolveLivePreviewArtifactScope(input.anchors),
        declarationId: input.declarationId,
        recoveredFromFrozenScope: false,
        retryScope: null,
      },
    },
    codeLivePreview: {
      schemaVersion: CODE_LIVE_PREVIEW_ARTIFACT_METADATA_SCHEMA_VERSION,
      previewId: input.lease.previewId,
      commandProfileId: input.lease.commandProfileId,
      workspace: {
        id: input.lease.workspaceRef.id,
        rootPath: input.lease.workspaceRef.rootPath,
      },
      sourceSurface: cloneCanvasSurface(input.lease.surface),
    },
  };
}

function createMaterializedLeaseStore(
  lease: LivePreviewLease,
  fallback?: ArtifactCanvasSupervisorPreviewLeaseStore | null,
): ArtifactCanvasSupervisorPreviewLeaseStore {
  return {
    getLease(previewId: string) {
      if (previewId === lease.previewId) {
        return lease;
      }
      return fallback?.getLease(previewId) ?? null;
    },
  };
}

function resolveLivePreviewArtifactScope(
  anchors: ResolvedLivePreviewArtifactAnchors,
): { scopeKind: 'conversation' | 'workspace'; scopeId: string } {
  return anchors.conversationId
    ? { scopeKind: 'conversation', scopeId: anchors.conversationId }
    : { scopeKind: 'workspace', scopeId: normalizePathToken(anchors.workspacePath) };
}

function buildLivePreviewArtifactId(previewId: string): string {
  return `artifact-live-preview-${hashToken(previewId)}`;
}

function buildMaterialChangeSignature(
  lease: LivePreviewLease,
  anchors: ResolvedLivePreviewArtifactAnchors,
): string {
  return hashStableJson({
    previewId: lease.previewId,
    commandProfileId: lease.commandProfileId,
    origin: lease.origin,
    sourceSurface: lease.surface,
    workspace: lease.workspaceRef,
    anchors,
  });
}

function cloneCanvasSurface(surface: CanvasSurfaceRef): CanvasSurfaceRef {
  return {
    kind: surface.kind,
    surfaceId: surface.surfaceId,
  };
}

function normalizePathToken(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function hashStableJson(value: unknown): string {
  return hashToken(stableJsonStringify(value));
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(',')}}`;
}
