import { createHash } from 'node:crypto';

import type { RuntimeMessageSegment } from '../../../platform/runtime/client.js';
import {
  RuntimeEnricherPriority,
  registerRuntimeInvocationAssistantEffectProcessor,
  type RuntimeInvocationAssistantEffectContext,
  type RuntimeInvocationAssistantEffectProcessor,
} from '../../../platform/runtime/invocationEnrichment.js';
import type { CatsCoreState } from '../../../core/types.js';
import {
  appendArtifactCanvasIntentActivity,
} from '../../shared/artifactCanvas/activity.js';
import {
  ARTIFACT_CANVAS_CLEAR_TOOL_NAME,
  ARTIFACT_CANVAS_SHOW_TOOL_NAME,
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  normalizeArtifactCanvasClearToolInput,
  normalizeArtifactCanvasShowToolInput,
  type ArtifactCanvasError,
  type ArtifactCanvasToolIdentity,
  type ArtifactCanvasToolResult,
  type CanvasSurfaceRef,
} from '../../shared/artifactCanvas/contracts.js';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  buildArtifactCanvasPolicyVersion,
  type ArtifactCanvasPolicyConfig,
} from '../../shared/artifactCanvas/iframePolicy.js';
import {
  type ArtifactCanvasRenderIntentHub,
  createArtifactCanvasIntentId,
  getDefaultArtifactCanvasRenderIntentHub,
} from '../../shared/artifactCanvas/renderIntent.js';
import { buildArtifactCanvasProjection } from '../../shared/artifactCanvas/projection.js';
import {
  CODE_ARTIFACT_DECLARATION_TOOL,
  CODE_ARTIFACT_DECLARATION_TOOL_NAME,
  CodeArtifactDeclarationError,
  type CodeArtifactDeclarationAnchors,
  type CodeArtifactProducer,
  type CodeArtifactToolResult,
} from '../shared/artifactDeclaration.js';
import { materializeCodeArtifactDeclaration } from './artifactMaterialization.js';
import {
  CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY,
  CODE_ARTIFACT_RUNTIME_HOOK_ID,
  observeCodeArtifactRuntimeToolCall,
  shouldAttachCodeArtifactRuntimeTooling,
  type CodeArtifactRuntimeToolingChannel,
} from './runtimeArtifactTooling.js';

export interface CodeArtifactRuntimeDeclarationExecutionContext {
  producer: CodeArtifactProducer;
  anchors: CodeArtifactDeclarationAnchors;
}

export interface CodeArtifactRuntimeDeclarationExecutionItem {
  toolId: string | null;
  declarationId: string | null;
  result: CodeArtifactToolResult;
}

export interface CodeArtifactRuntimeDeclarationExecutionResult {
  core: CatsCoreState;
  declarations: CodeArtifactRuntimeDeclarationExecutionItem[];
}

export interface CodeArtifactRuntimeAssistantEffectMetadata {
  codeArtifactToolResults: CodeArtifactRuntimeDeclarationExecutionItem[];
  artifactCanvasToolResults?: CodeArtifactRuntimeCanvasExecutionItem[];
}

export interface CodeArtifactRuntimeCanvasExecutionContext {
  actorId: string | null;
  runtimeSessionId?: string | null;
  anchors: CodeArtifactDeclarationAnchors;
  surface: CanvasSurfaceRef | null;
  policyConfig?: ArtifactCanvasPolicyConfig;
  renderIntentHub?: ArtifactCanvasRenderIntentHub;
}

export interface CodeArtifactRuntimeCanvasExecutionItem {
  toolId: string | null;
  toolName: typeof ARTIFACT_CANVAS_SHOW_TOOL_NAME | typeof ARTIFACT_CANVAS_CLEAR_TOOL_NAME;
  result: ArtifactCanvasToolResult;
}

export interface CodeArtifactRuntimeCanvasExecutionResult {
  core: CatsCoreState;
  canvas: CodeArtifactRuntimeCanvasExecutionItem[];
}

export function executeCodeArtifactRuntimeDeclarations(input: {
  core: CatsCoreState;
  channel: CodeArtifactRuntimeToolingChannel;
  segments: readonly RuntimeMessageSegment[];
  context: CodeArtifactRuntimeDeclarationExecutionContext;
  now?: Date;
}): CodeArtifactRuntimeDeclarationExecutionResult {
  if (!shouldAttachCodeArtifactRuntimeTooling(input.channel)) {
    return { core: input.core, declarations: [] };
  }

  let core = input.core;
  const declarations: CodeArtifactRuntimeDeclarationExecutionItem[] = [];
  for (const segment of input.segments) {
    const observation = observeCodeArtifactRuntimeToolCall(segment);
    if (!observation) {
      continue;
    }
    if (observation.status === 'rejected') {
      declarations.push({
        toolId: observation.toolId,
        declarationId: observation.declarationId,
        result: {
          status: 'rejected',
          error: {
            code: observation.errorCode ?? 'artifact_metadata_invalid',
            message: observation.message ?? 'declare_artifact call was rejected.',
          },
        },
      });
      continue;
    }

    try {
      const declaration = CODE_ARTIFACT_DECLARATION_TOOL.createDeclaration(
        observation.input,
        input.context.producer,
        input.context.anchors,
      );
      const materialized = materializeCodeArtifactDeclaration(
        core,
        declaration,
        input.now,
      );
      core = materialized.core;
      declarations.push({
        toolId: observation.toolId,
        declarationId: observation.declarationId,
        result: materialized.toolResult,
      });
    } catch (error) {
      const declarationError = error instanceof CodeArtifactDeclarationError
        ? error
        : new CodeArtifactDeclarationError(
          'artifact_metadata_invalid',
          error instanceof Error ? error.message : String(error),
        );
      declarations.push({
        toolId: observation.toolId,
        declarationId: observation.declarationId,
        result: CODE_ARTIFACT_DECLARATION_TOOL.rejected(declarationError),
      });
    }
  }

  return { core, declarations };
}

export function executeCodeArtifactRuntimeCanvasIntents(input: {
  core: CatsCoreState;
  channel: CodeArtifactRuntimeToolingChannel;
  segments: readonly RuntimeMessageSegment[];
  declarations: readonly CodeArtifactRuntimeDeclarationExecutionItem[];
  context: CodeArtifactRuntimeCanvasExecutionContext;
  now?: Date;
}): CodeArtifactRuntimeCanvasExecutionResult {
  if (!shouldAttachCodeArtifactRuntimeTooling(input.channel)) {
    return { core: input.core, canvas: [] };
  }

  let core = input.core;
  const canvas: CodeArtifactRuntimeCanvasExecutionItem[] = [];
  const declarationIndex = buildArtifactCanvasDeclarationIndex({
    core,
    declarations: input.declarations,
    context: input.context,
  });
  for (const segment of input.segments) {
    if (segment.kind !== 'tool_use') {
      continue;
    }
    if (segment.toolName === ARTIFACT_CANVAS_SHOW_TOOL_NAME) {
      const execution = executeShowInCanvasToolUse({
        core,
        segment,
        declarationIndex,
        context: input.context,
        now: input.now,
      });
      core = execution.core;
      canvas.push(execution.item);
    } else if (segment.toolName === ARTIFACT_CANVAS_CLEAR_TOOL_NAME) {
      const execution = executeClearCanvasToolUse({
        core,
        segment,
        context: input.context,
        now: input.now,
      });
      core = execution.core;
      canvas.push(execution.item);
    }
  }

  return { core, canvas };
}

export function createCodeArtifactRuntimeAssistantEffectProcessor(): RuntimeInvocationAssistantEffectProcessor {
  return {
    id: CODE_ARTIFACT_RUNTIME_HOOK_ID,
    priority: RuntimeEnricherPriority.POST_PROCESS,
    shouldApplyAssistantEffects(channel, segments) {
      return shouldAttachCodeArtifactRuntimeTooling(channel)
        && segments.some((segment) =>
          segment.kind === 'tool_use'
          && (
            segment.toolName === CODE_ARTIFACT_DECLARATION_TOOL_NAME
            || segment.toolName === ARTIFACT_CANVAS_SHOW_TOOL_NAME
            || segment.toolName === ARTIFACT_CANVAS_CLEAR_TOOL_NAME
          ));
    },
    applyAssistantEffects(channel, input, context) {
      if (!shouldAttachCodeArtifactRuntimeTooling(channel)) {
        return null;
      }
      const anchors = resolveRuntimeDeclarationAnchors(
        input.core,
        channel,
        context,
      );

      const execution = executeCodeArtifactRuntimeDeclarations({
        core: input.core,
        channel,
        segments: input.segments,
        context: {
          producer: {
            kind: 'agent',
            actorId: normalizeOptionalString(context.actorId),
            runtimeSessionId: normalizeOptionalString(context.runtimeSessionId),
          },
          anchors,
        },
        now: context.now,
      });
      const canvasExecution = executeCodeArtifactRuntimeCanvasIntents({
        core: execution.core,
        channel,
        segments: input.segments,
        declarations: execution.declarations,
        context: {
          actorId: normalizeOptionalString(context.actorId),
          runtimeSessionId: normalizeOptionalString(context.runtimeSessionId),
          anchors,
          surface: resolveRuntimeArtifactCanvasSurface(anchors),
        },
        now: context.now,
      });

      const hasDeclarations = execution.declarations.length > 0;
      const hasCanvas = canvasExecution.canvas.length > 0;
      if (!hasDeclarations && !hasCanvas) {
        return { core: canvasExecution.core };
      }

      let segments = input.segments;
      if (hasDeclarations) {
        segments = projectCodeArtifactToolResultsIntoSegments(
          segments,
          execution.declarations,
        );
      }
      if (hasCanvas) {
        segments = projectCodeArtifactCanvasToolResultsIntoSegments(
          segments,
          canvasExecution.canvas,
        );
      }

      const metadata: Partial<CodeArtifactRuntimeAssistantEffectMetadata> = {};
      if (hasDeclarations) {
        metadata.codeArtifactToolResults = execution.declarations;
      }
      if (hasCanvas) {
        metadata.artifactCanvasToolResults = canvasExecution.canvas;
      }

      return {
        core: canvasExecution.core,
        segments,
        metadata,
      };
    },
  };
}

export function projectCodeArtifactToolResultsIntoSegments(
  segments: readonly RuntimeMessageSegment[],
  declarations: readonly CodeArtifactRuntimeDeclarationExecutionItem[],
): RuntimeMessageSegment[] {
  const projected: RuntimeMessageSegment[] = [];
  const unusedDeclarations = declarations.map((declaration) => ({
    declaration,
    used: false,
  }));

  for (const segment of segments) {
    projected.push(segment);
    const observation = observeCodeArtifactRuntimeToolCall(segment);
    if (!observation) {
      continue;
    }
    const declaration = findMatchingDeclarationResult(
      unusedDeclarations,
      observation.toolId,
      observation.declarationId,
    );
    if (!declaration) {
      continue;
    }
    projected.push(buildCodeArtifactToolResultSegment(declaration));
  }

  for (const entry of unusedDeclarations) {
    if (!entry.used) {
      projected.push(buildCodeArtifactToolResultSegment(entry.declaration));
    }
  }

  return projected;
}

export function projectCodeArtifactCanvasToolResultsIntoSegments(
  segments: readonly RuntimeMessageSegment[],
  canvasResults: readonly CodeArtifactRuntimeCanvasExecutionItem[],
): RuntimeMessageSegment[] {
  const projected: RuntimeMessageSegment[] = [];
  const unusedResults = canvasResults.map((canvas) => ({
    canvas,
    used: false,
  }));

  for (const segment of segments) {
    projected.push(segment);
    if (
      segment.kind !== 'tool_use'
      || (
        segment.toolName !== ARTIFACT_CANVAS_SHOW_TOOL_NAME
        && segment.toolName !== ARTIFACT_CANVAS_CLEAR_TOOL_NAME
      )
    ) {
      continue;
    }
    const match = unusedResults.find((candidate) =>
      !candidate.used
      && candidate.canvas.toolName === segment.toolName
      && candidate.canvas.toolId === (segment.toolId ?? null));
    if (!match) {
      continue;
    }
    match.used = true;
    projected.push(buildArtifactCanvasToolResultSegment(match.canvas));
  }

  for (const entry of unusedResults) {
    if (!entry.used) {
      projected.push(buildArtifactCanvasToolResultSegment(entry.canvas));
    }
  }

  return projected;
}

function findMatchingDeclarationResult(
  declarations: Array<{ declaration: CodeArtifactRuntimeDeclarationExecutionItem; used: boolean }>,
  toolId: string | null,
  declarationId: string | null,
): CodeArtifactRuntimeDeclarationExecutionItem | null {
  const unused = declarations.filter((candidate) => !candidate.used);
  const match = toolId !== null
    ? unused.find((candidate) => candidate.declaration.toolId === toolId)
    : declarationId !== null
      ? unused.find((candidate) =>
          candidate.declaration.toolId === null
          && candidate.declaration.declarationId === declarationId)
      : findOnlyNullIdentityDeclaration(unused);
  if (!match) {
    return null;
  }
  match.used = true;
  return match.declaration;
}

function findOnlyNullIdentityDeclaration(
  declarations: Array<{ declaration: CodeArtifactRuntimeDeclarationExecutionItem; used: boolean }>,
): { declaration: CodeArtifactRuntimeDeclarationExecutionItem; used: boolean } | null {
  const matches = declarations.filter((candidate) =>
    candidate.declaration.toolId === null
    && candidate.declaration.declarationId === null);
  return matches.length === 1 ? matches[0]! : null;
}

function buildCodeArtifactToolResultSegment(
  declaration: CodeArtifactRuntimeDeclarationExecutionItem,
): RuntimeMessageSegment {
  return {
    kind: 'tool_result',
    text: JSON.stringify(declaration.result),
    toolName: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
    toolId: declaration.toolId,
    ...(declaration.result.status === 'rejected' ? { isError: true } : {}),
  };
}

function buildArtifactCanvasToolResultSegment(
  canvas: CodeArtifactRuntimeCanvasExecutionItem,
): RuntimeMessageSegment {
  return {
    kind: 'tool_result',
    text: JSON.stringify(canvas.result),
    toolName: canvas.toolName,
    toolId: canvas.toolId,
    ...(canvas.result.status === 'rejected' ? { isError: true } : {}),
  };
}

const codeArtifactRuntimeAssistantEffectProcessor =
  createCodeArtifactRuntimeAssistantEffectProcessor();

export function registerCodeArtifactRuntimeAssistantEffectProcessor(): void {
  registerRuntimeInvocationAssistantEffectProcessor(
    codeArtifactRuntimeAssistantEffectProcessor,
  );
}

function executeShowInCanvasToolUse(input: {
  core: CatsCoreState;
  segment: Extract<RuntimeMessageSegment, { kind: 'tool_use' }>;
  declarationIndex: ArtifactCanvasDeclarationIndex;
  context: CodeArtifactRuntimeCanvasExecutionContext;
  now?: Date;
}): { core: CatsCoreState; item: CodeArtifactRuntimeCanvasExecutionItem } {
  const toolArgs = readCanvasToolUseArguments(input.segment);
  if (!toolArgs.ok) {
    return rejectedCanvasExecutionItem(input.core, input.segment, {
      code: 'artifact_canvas_required_field_empty',
      message: toolArgs.message,
    });
  }

  const normalized = normalizeArtifactCanvasShowToolInput(
    toolArgs.value,
    input.context.surface,
  );
  if (normalized.status === 'rejected') {
    return rejectedCanvasExecutionItem(input.core, input.segment, normalized.error);
  }

  const artifactId = resolveArtifactCanvasToolArtifactId(
    normalized.input.identity,
    input.declarationIndex,
  );
  if (artifactId.status === 'rejected') {
    return rejectedCanvasExecutionItem(input.core, input.segment, artifactId.error);
  }

  const surface = input.context.surface!;
  const projection = buildArtifactCanvasProjection({
    core: input.core,
    surface,
    artifactId: artifactId.artifactId,
    presentationRequested: normalized.input.presentation,
    policyConfig: input.context.policyConfig,
  });
  if (projection.status === 'error') {
    return rejectedCanvasExecutionItem(input.core, input.segment, projection.error);
  }

  const targetUrl = canvasSurfaceRouteRegistry.canvasUrl(
    surface,
    artifactId.artifactId,
    normalized.input.presentation,
  );
  const now = input.now ?? new Date();
  const activity = appendArtifactCanvasIntentActivity({
    core: input.core,
    kind: 'artifact_canvas_show_intent',
    surface,
    actorId: input.context.actorId,
    artifactId: artifactId.artifactId,
    targetUrl,
    policyVersion: projection.projection.policyVersion,
    presentationRequested: projection.projection.presentationRequested,
    presentationResolved: projection.projection.presentationResolved,
    iframeSandboxProfile: projection.projection.iframeSandboxProfile,
    now,
  });
  const intent = composeArtifactCanvasNavigateIntent({
    intentId: createArtifactCanvasIntentId(),
    activityId: activity.activity.id,
    surface,
    artifactId: artifactId.artifactId,
    presentationRequested: projection.projection.presentationRequested,
    policyVersion: projection.projection.policyVersion,
    triggeredAt: now.toISOString(),
  });
  const hub = input.context.renderIntentHub ?? getDefaultArtifactCanvasRenderIntentHub();
  hub.publish({ intent, now });

  return {
    core: activity.core,
    item: {
      toolId: input.segment.toolId ?? null,
      toolName: ARTIFACT_CANVAS_SHOW_TOOL_NAME,
      result: {
        status: 'accepted',
        toolName: ARTIFACT_CANVAS_SHOW_TOOL_NAME,
        activityId: activity.activity.id,
        targetUrl,
        policyVersion: projection.projection.policyVersion,
        artifactId: artifactId.artifactId,
        presentationRequested: projection.projection.presentationRequested,
        presentationResolved: projection.projection.presentationResolved,
      },
    },
  };
}

function executeClearCanvasToolUse(input: {
  core: CatsCoreState;
  segment: Extract<RuntimeMessageSegment, { kind: 'tool_use' }>;
  context: CodeArtifactRuntimeCanvasExecutionContext;
  now?: Date;
}): { core: CatsCoreState; item: CodeArtifactRuntimeCanvasExecutionItem } {
  const toolArgs = readCanvasToolUseArguments(input.segment);
  if (!toolArgs.ok) {
    return rejectedCanvasExecutionItem(input.core, input.segment, {
      code: 'artifact_canvas_required_field_empty',
      message: toolArgs.message,
    });
  }

  const normalized = normalizeArtifactCanvasClearToolInput(
    toolArgs.value,
    input.context.surface,
  );
  if (normalized.status === 'rejected') {
    return rejectedCanvasExecutionItem(input.core, input.segment, normalized.error);
  }

  const surface = input.context.surface!;
  const targetUrl = canvasSurfaceRouteRegistry.parentUrl(surface);
  const policyVersion = buildArtifactCanvasPolicyVersion(
    input.context.policyConfig ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  ).policyVersion;
  const now = input.now ?? new Date();
  const activity = appendArtifactCanvasIntentActivity({
    core: input.core,
    kind: 'artifact_canvas_clear_intent',
    surface,
    actorId: input.context.actorId,
    targetUrl,
    policyVersion,
    now,
  });
  const intent = composeArtifactCanvasNavigateIntent({
    intentId: createArtifactCanvasIntentId(),
    activityId: activity.activity.id,
    surface,
    artifactId: null,
    presentationRequested: null,
    policyVersion,
    triggeredAt: now.toISOString(),
  });
  const hub = input.context.renderIntentHub ?? getDefaultArtifactCanvasRenderIntentHub();
  hub.publish({ intent, now });

  return {
    core: activity.core,
    item: {
      toolId: input.segment.toolId ?? null,
      toolName: ARTIFACT_CANVAS_CLEAR_TOOL_NAME,
      result: {
        status: 'accepted',
        toolName: ARTIFACT_CANVAS_CLEAR_TOOL_NAME,
        activityId: activity.activity.id,
        targetUrl,
        policyVersion,
      },
    },
  };
}

function rejectedCanvasExecutionItem(
  core: CatsCoreState,
  segment: Extract<RuntimeMessageSegment, { kind: 'tool_use' }>,
  error: ArtifactCanvasError,
): { core: CatsCoreState; item: CodeArtifactRuntimeCanvasExecutionItem } {
  return {
    core,
    item: {
      toolId: segment.toolId ?? null,
      toolName: segment.toolName === ARTIFACT_CANVAS_CLEAR_TOOL_NAME
        ? ARTIFACT_CANVAS_CLEAR_TOOL_NAME
        : ARTIFACT_CANVAS_SHOW_TOOL_NAME,
      result: {
        status: 'rejected',
        error,
      },
    },
  };
}

function resolveArtifactCanvasToolArtifactId(
  identity: ArtifactCanvasToolIdentity,
  index: ArtifactCanvasDeclarationIndex,
): { status: 'accepted'; artifactId: string } | { status: 'rejected'; error: ArtifactCanvasError } {
  if (identity.kind === 'artifact') {
    return { status: 'accepted', artifactId: identity.artifactId };
  }

  if (!index.caller) {
    return {
      status: 'rejected',
      error: {
        code: 'artifact_canvas_declaration_unknown',
        message: 'show_in_canvas declarationId did not resolve to an accepted artifact.',
        details: { declarationId: identity.declarationId },
      },
    };
  }

  const lookupKey = buildArtifactCanvasDeclarationLookupKey({
    producerKey: index.caller.producerKey,
    scopeKey: index.caller.scopeKey,
    declarationId: identity.declarationId,
  });
  const artifactIds = index.artifactIdsByLookupKey.get(lookupKey) ?? new Set<string>();
  if (artifactIds.size === 1) {
    return { status: 'accepted', artifactId: [...artifactIds][0]! };
  }
  if (artifactIds.size > 1) {
    return {
      status: 'rejected',
      error: {
        code: 'artifact_canvas_declaration_collision',
        message: 'show_in_canvas declarationId resolved to multiple artifact ids.',
        details: { declarationId: identity.declarationId },
      },
    };
  }

  const sameScopeProducerKeys = index.producerKeysByScopeDeclarationKey.get(
    buildArtifactCanvasScopeDeclarationKey({
      scopeKey: index.caller.scopeKey,
      declarationId: identity.declarationId,
    }),
  ) ?? new Set<string>();
  if (
    sameScopeProducerKeys.size > 0
    && !sameScopeProducerKeys.has(index.caller.producerKey)
  ) {
    return {
      status: 'rejected',
      error: {
        code: 'artifact_canvas_declaration_producer_mismatch',
        message: 'show_in_canvas declarationId belongs to another same-turn producer.',
        details: { declarationId: identity.declarationId },
      },
    };
  }

  return {
    status: 'rejected',
    error: {
      code: 'artifact_canvas_declaration_unknown',
      message: 'show_in_canvas declarationId did not resolve to an accepted artifact.',
      details: { declarationId: identity.declarationId },
    },
  };
}

type ArtifactCanvasDeclarationScopeKind =
  | 'run'
  | 'runtime'
  | 'conversation'
  | 'workspace';

interface ArtifactCanvasDeclarationCallerKey {
  producerKey: string;
  scopeKey: string;
}

interface ArtifactCanvasDeclarationIdempotency {
  producerKind: CodeArtifactProducer['kind'];
  producerIdentity: string;
  scopeKind: ArtifactCanvasDeclarationScopeKind;
  scopeId: string;
  declarationId: string;
}

interface ArtifactCanvasDeclarationIndex {
  caller: ArtifactCanvasDeclarationCallerKey | null;
  artifactIdsByLookupKey: Map<string, Set<string>>;
  producerKeysByScopeDeclarationKey: Map<string, Set<string>>;
}

function buildArtifactCanvasDeclarationIndex(input: {
  core: CatsCoreState;
  declarations: readonly CodeArtifactRuntimeDeclarationExecutionItem[];
  context: CodeArtifactRuntimeCanvasExecutionContext;
}): ArtifactCanvasDeclarationIndex {
  const index: ArtifactCanvasDeclarationIndex = {
    caller: resolveArtifactCanvasDeclarationCallerKey(input.context),
    artifactIdsByLookupKey: new Map(),
    producerKeysByScopeDeclarationKey: new Map(),
  };

  for (const declaration of input.declarations) {
    if (
      declaration.result.status !== 'accepted'
      || !normalizeOptionalString(declaration.result.artifactId)
    ) {
      continue;
    }
    const artifactId = normalizeOptionalString(declaration.result.artifactId);
    const resultDeclarationId =
      normalizeOptionalString(declaration.result.declarationId)
      ?? normalizeOptionalString(declaration.declarationId);
    if (!artifactId || !resultDeclarationId) {
      continue;
    }

    const artifact = input.core.artifacts.find((candidate) => candidate.id === artifactId) ?? null;
    const idempotency = readArtifactCanvasDeclarationIdempotency(artifact);
    if (!idempotency || idempotency.declarationId !== resultDeclarationId) {
      continue;
    }

    const producerKey = `${idempotency.producerKind}:${idempotency.producerIdentity}`;
    const scopeKey = `${idempotency.scopeKind}:${idempotency.scopeId}`;
    const lookupKey = buildArtifactCanvasDeclarationLookupKey({
      producerKey,
      scopeKey,
      declarationId: idempotency.declarationId,
    });
    const artifactIds = index.artifactIdsByLookupKey.get(lookupKey) ?? new Set<string>();
    artifactIds.add(artifactId);
    index.artifactIdsByLookupKey.set(lookupKey, artifactIds);

    const scopeDeclarationKey = buildArtifactCanvasScopeDeclarationKey({
      scopeKey,
      declarationId: idempotency.declarationId,
    });
    const producerKeys =
      index.producerKeysByScopeDeclarationKey.get(scopeDeclarationKey) ?? new Set<string>();
    producerKeys.add(producerKey);
    index.producerKeysByScopeDeclarationKey.set(scopeDeclarationKey, producerKeys);
  }

  return index;
}

function resolveArtifactCanvasDeclarationCallerKey(
  context: CodeArtifactRuntimeCanvasExecutionContext,
): ArtifactCanvasDeclarationCallerKey | null {
  const actorId = normalizeOptionalString(context.actorId);
  if (!actorId) {
    return null;
  }
  const scope = resolveArtifactCanvasDeclarationScopeKey(context);
  if (!scope) {
    return null;
  }
  return {
    producerKey: `agent:actor:${actorId}`,
    scopeKey: scope,
  };
}

function resolveArtifactCanvasDeclarationScopeKey(
  context: CodeArtifactRuntimeCanvasExecutionContext,
): string | null {
  const runId = normalizeOptionalString(context.anchors.runId);
  if (runId) {
    return `run:${runId}`;
  }
  const runtimeSessionId = normalizeOptionalString(context.runtimeSessionId);
  if (runtimeSessionId) {
    return `runtime:${runtimeSessionId}`;
  }
  const conversationId = normalizeOptionalString(context.anchors.conversationId);
  if (conversationId) {
    return `conversation:${conversationId}`;
  }
  const workspacePath = normalizeOptionalString(context.anchors.workspacePath);
  if (workspacePath) {
    return `workspace:${normalizeArtifactCanvasWorkspaceScopeId(workspacePath)}`;
  }
  return null;
}

function readArtifactCanvasDeclarationIdempotency(
  artifact: CatsCoreState['artifacts'][number] | null,
): ArtifactCanvasDeclarationIdempotency | null {
  const declaration = asRecord(artifact?.metadata.codeArtifactDeclaration);
  const idempotency = asRecord(declaration?.idempotency);
  const producerKind = normalizeOptionalString(idempotency?.producerKind);
  const producerIdentity = normalizeOptionalString(idempotency?.producerIdentity);
  const scopeKind = normalizeOptionalString(idempotency?.scopeKind);
  const scopeId = normalizeOptionalString(idempotency?.scopeId);
  const declarationId = normalizeOptionalString(idempotency?.declarationId);
  if (
    !isCodeArtifactProducerKind(producerKind)
    || !producerIdentity
    || !isArtifactCanvasDeclarationScopeKind(scopeKind)
    || !scopeId
    || !declarationId
  ) {
    return null;
  }

  return {
    producerKind,
    producerIdentity,
    scopeKind,
    scopeId,
    declarationId,
  };
}

function buildArtifactCanvasDeclarationLookupKey(input: {
  producerKey: string;
  scopeKey: string;
  declarationId: string;
}): string {
  return `${input.producerKey}\u0000${input.scopeKey}\u0000${input.declarationId}`;
}

function buildArtifactCanvasScopeDeclarationKey(input: {
  scopeKey: string;
  declarationId: string;
}): string {
  return `${input.scopeKey}\u0000${input.declarationId}`;
}

function normalizeArtifactCanvasWorkspaceScopeId(workspacePath: string): string {
  const normalized = workspacePath.replaceAll('\\', '/').replace(/\/+$/u, '') || '/';
  return /^[a-zA-Z]:\//u.test(normalized) ? normalized.toLowerCase() : normalized;
}

function isCodeArtifactProducerKind(
  value: string | null,
): value is CodeArtifactProducer['kind'] {
  return value === 'agent'
    || value === 'tool'
    || value === 'system'
    || value === 'user';
}

function isArtifactCanvasDeclarationScopeKind(
  value: string | null,
): value is ArtifactCanvasDeclarationScopeKind {
  return value === 'run'
    || value === 'runtime'
    || value === 'conversation'
    || value === 'workspace';
}

function resolveRuntimeArtifactCanvasSurface(
  anchors: CodeArtifactDeclarationAnchors,
): CanvasSurfaceRef | null {
  const taskId = normalizeOptionalString(anchors.taskId);
  if (taskId) {
    return { kind: 'code_task', surfaceId: taskId };
  }
  const workspacePath = normalizeOptionalString(anchors.workspacePath);
  if (workspacePath) {
    return { kind: 'code_codespace', surfaceId: createCodespaceId(workspacePath) };
  }
  return null;
}

function createCodespaceId(workspacePath: string): string {
  const normalized = workspacePath.trim().replace(/\\/g, '/');
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `codespace-${digest}`;
}

type CanvasToolUseArgumentsReadResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

function readCanvasToolUseArguments(
  segment: Extract<RuntimeMessageSegment, { kind: 'tool_use' }>,
): CanvasToolUseArgumentsReadResult {
  if (
    segment.toolArgs
    && typeof segment.toolArgs === 'object'
    && !Array.isArray(segment.toolArgs)
  ) {
    return { ok: true, value: segment.toolArgs };
  }

  const raw = segment.text.trim();
  if (!raw) {
    return { ok: true, value: {} };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        message: `${segment.toolName ?? 'Artifact Canvas'} tool arguments must be an object.`,
      };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      message: `${segment.toolName ?? 'Artifact Canvas'} tool arguments must be valid JSON.`,
    };
  }
}

function resolveRuntimeDeclarationAnchors(
  core: CatsCoreState,
  channel: CodeArtifactRuntimeToolingChannel,
  context: RuntimeInvocationAssistantEffectContext,
): CodeArtifactDeclarationAnchors {
  const runtimeMetadata = context.runtimeContext?.metadata ?? {};
  const runtimeSessionId = normalizeOptionalString(context.runtimeSessionId);
  const sessionRun = runtimeSessionId
    ? [...core.runs]
        .filter((run) =>
          normalizeOptionalString(asRecord(run.metadata)?.sessionId) === runtimeSessionId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    : null;
  const explicitTaskId =
    normalizeOptionalString(context.runtimeContext?.taskId)
    ?? normalizeOptionalString(runtimeMetadata.taskId);
  const taskId = explicitTaskId ?? sessionRun?.taskId ?? null;
  const task = taskId
    ? core.tasks.find((candidate) => candidate.id === taskId) ?? null
    : null;
  const workItem = taskId
    ? [...core.workItems]
        .filter((candidate) => candidate.taskId === taskId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
    : null;
  const codeArtifactMetadata = asRecord(
    runtimeMetadata[CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY],
  );

  return {
    conversationId:
      normalizeOptionalString(runtimeMetadata.conversationId)
      ?? sessionRun?.conversationId
      ?? task?.conversationId
      ?? null,
    taskId,
    runId: normalizeOptionalString(runtimeMetadata.runId) ?? sessionRun?.id ?? null,
    projectId:
      normalizeOptionalString(runtimeMetadata.projectId)
      ?? workItem?.projectId
      ?? null,
    workItemId: normalizeOptionalString(runtimeMetadata.workItemId) ?? workItem?.id ?? null,
    workspacePath:
      normalizeOptionalString(context.runtimeContext?.workspace?.cwd)
      ?? normalizeOptionalString(channel.chatCwd)
      ?? normalizeOptionalString(codeArtifactMetadata?.workspacePath)
      ?? null,
  };
}

function normalizeOptionalString(input: unknown): string | null {
  return typeof input === 'string' && input.trim().length > 0
    ? input.trim()
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
