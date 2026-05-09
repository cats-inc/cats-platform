import { appendCoreActivity } from '../../../core/model/index.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreActivityKind,
  CoreRecordMetadata,
} from '../../../core/types.js';
import type {
  ArtifactCanvasNavigateIntent,
  ArtifactCanvasIframeSandboxProfile,
  ArtifactCanvasPresentationInput,
  ArtifactCanvasResolvedPresentation,
  CanvasSurfaceAnchorSource,
  CanvasSurfaceRef,
} from './contracts.js';

export interface ArtifactCanvasIntentActivityInput {
  core: CatsCoreState;
  kind: Extract<
    CoreActivityKind,
    'artifact_canvas_show_intent' | 'artifact_canvas_clear_intent'
  >;
  surface: CanvasSurfaceRef;
  actorId?: string | null;
  artifactId?: string | null;
  targetUrl: string;
  policyVersion: string;
  presentationRequested?: ArtifactCanvasPresentationInput | null;
  presentationResolved?: ArtifactCanvasResolvedPresentation | null;
  iframeSandboxProfile?: ArtifactCanvasIframeSandboxProfile | null;
  navigateIntent?: Pick<ArtifactCanvasNavigateIntent, 'activityId' | 'targetUrl'> | null;
  message?: string;
  metadata?: CoreRecordMetadata;
  now?: Date;
}

export interface ArtifactCanvasIntentActivityResult {
  core: CatsCoreState;
  activity: CoreActivityRecord;
  created: boolean;
}

export function appendArtifactCanvasIntentActivity(
  input: ArtifactCanvasIntentActivityInput,
): ArtifactCanvasIntentActivityResult {
  assertNavigateIntentTarget(input.navigateIntent, input.targetUrl);
  const anchor = resolveArtifactCanvasActivityAnchor(input.surface);
  const metadata = buildArtifactCanvasActivityMetadata({
    surface: input.surface,
    anchor,
    targetUrl: input.targetUrl,
    policyVersion: input.policyVersion,
    presentationRequested: input.presentationRequested ?? null,
    presentationResolved: input.presentationResolved ?? null,
    iframeSandboxProfile: input.iframeSandboxProfile ?? null,
    metadata: input.metadata,
  });
  const result = appendCoreActivity(input.core, {
    id: input.navigateIntent?.activityId,
    kind: input.kind,
    actorId: input.actorId ?? null,
    projectId: anchor.source === 'activity_project_anchor' ? anchor.projectId : null,
    workItemId: anchor.source === 'activity_work_item_anchor' ? anchor.workItemId : null,
    conversationId:
      anchor.source === 'activity_conversation_anchor'
        ? anchor.conversationId
        : null,
    taskId: anchor.source === 'activity_task_anchor' ? anchor.taskId : null,
    runId: null,
    artifactId: input.artifactId ?? null,
    message: input.message ?? defaultArtifactCanvasActivityMessage(input.kind),
    metadata,
  }, input.now);
  return result;
}

export function resolveArtifactCanvasActivityAnchor(
  surface: CanvasSurfaceRef,
): CanvasSurfaceAnchorSource {
  switch (surface.kind) {
    case 'work_project':
      return {
        source: 'activity_project_anchor',
        surfaceKind: surface.kind,
        projectId: surface.surfaceId,
      };
    case 'work_item':
      return {
        source: 'activity_work_item_anchor',
        surfaceKind: surface.kind,
        workItemId: surface.surfaceId,
      };
    case 'code_task':
    case 'work_task':
      return {
        source: 'activity_task_anchor',
        surfaceKind: surface.kind,
        taskId: surface.surfaceId,
      };
    case 'chat_conversation':
      return {
        source: 'activity_conversation_anchor',
        surfaceKind: surface.kind,
        conversationId: surface.surfaceId,
      };
    case 'code_codespace':
      return {
        source: 'activity_metadata_anchor',
        surfaceKind: surface.kind,
        codespaceId: surface.surfaceId,
      };
    default: {
      const exhaustive: never = surface.kind;
      return exhaustive;
    }
  }
}

function buildArtifactCanvasActivityMetadata(input: {
  surface: CanvasSurfaceRef;
  anchor: CanvasSurfaceAnchorSource;
  targetUrl: string;
  policyVersion: string;
  presentationRequested: ArtifactCanvasPresentationInput | null;
  presentationResolved: ArtifactCanvasResolvedPresentation | null;
  iframeSandboxProfile: ArtifactCanvasIframeSandboxProfile | null;
  metadata?: CoreRecordMetadata;
}): CoreRecordMetadata {
  assertNoConflictingCanvasMetadata(input.metadata, input.surface);
  return {
    ...(input.metadata ?? {}),
    artifactCanvas: {
      surfaceKind: input.surface.kind,
      surfaceId: input.surface.surfaceId,
      surfaceAnchorSource: input.anchor.source,
      targetUrl: input.targetUrl,
      policyVersion: input.policyVersion,
      presentationRequested: input.presentationRequested,
      presentationResolved: input.presentationResolved,
      iframeSandboxProfile: input.iframeSandboxProfile
        ? structuredClone(input.iframeSandboxProfile)
        : null,
    },
  };
}

function assertNoConflictingCanvasMetadata(
  metadata: CoreRecordMetadata | undefined,
  surface: CanvasSurfaceRef,
): void {
  const artifactCanvas = asRecord(metadata?.artifactCanvas);
  if (!artifactCanvas) {
    return;
  }
  const surfaceId = readString(artifactCanvas.surfaceId);
  if (surfaceId !== null && surfaceId !== surface.surfaceId) {
    throw new Error('Artifact Canvas activity metadata.surfaceId conflicts with anchor.');
  }
  const surfaceKind = readString(artifactCanvas.surfaceKind);
  if (surfaceKind !== null && surfaceKind !== surface.kind) {
    throw new Error('Artifact Canvas activity metadata.surfaceKind conflicts with anchor.');
  }
}

function assertNavigateIntentTarget(
  navigateIntent: Pick<ArtifactCanvasNavigateIntent, 'targetUrl'> | null | undefined,
  targetUrl: string,
): void {
  if (navigateIntent && navigateIntent.targetUrl !== targetUrl) {
    throw new Error('Artifact Canvas navigate intent targetUrl conflicts with activity targetUrl.');
  }
}

function defaultArtifactCanvasActivityMessage(
  kind: ArtifactCanvasIntentActivityInput['kind'],
): string {
  return kind === 'artifact_canvas_show_intent'
    ? 'Artifact Canvas show intent recorded.'
    : 'Artifact Canvas clear intent recorded.';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}
