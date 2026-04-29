import type { RuntimeMessageSegment } from '../../../platform/runtime/client.js';
import {
  RuntimeEnricherPriority,
  registerRuntimeInvocationAssistantEffectProcessor,
  type RuntimeInvocationAssistantEffectContext,
  type RuntimeInvocationAssistantEffectProcessor,
} from '../../../platform/runtime/invocationEnrichment.js';
import type { CatsCoreState } from '../../../core/types.js';
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

export function createCodeArtifactRuntimeAssistantEffectProcessor(): RuntimeInvocationAssistantEffectProcessor {
  return {
    id: CODE_ARTIFACT_RUNTIME_HOOK_ID,
    priority: RuntimeEnricherPriority.POST_PROCESS,
    shouldApplyAssistantEffects(channel, segments) {
      return shouldAttachCodeArtifactRuntimeTooling(channel)
        && segments.some((segment) =>
          segment.kind === 'tool_use'
          && segment.toolName === CODE_ARTIFACT_DECLARATION_TOOL_NAME);
    },
    applyAssistantEffects(channel, input, context) {
      if (!shouldAttachCodeArtifactRuntimeTooling(channel)) {
        return null;
      }

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
          anchors: resolveRuntimeDeclarationAnchors(
            input.core,
            channel,
            context,
          ),
        },
        now: context.now,
      });

      return execution.declarations.length > 0
        ? {
            core: execution.core,
            segments: projectCodeArtifactToolResultsIntoSegments(
              input.segments,
              execution.declarations,
            ),
            metadata: {
              codeArtifactToolResults: execution.declarations,
            } satisfies CodeArtifactRuntimeAssistantEffectMetadata,
          }
        : {
            core: execution.core,
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

  return projected;
}

function findMatchingDeclarationResult(
  declarations: Array<{ declaration: CodeArtifactRuntimeDeclarationExecutionItem; used: boolean }>,
  toolId: string | null,
  declarationId: string | null,
): CodeArtifactRuntimeDeclarationExecutionItem | null {
  const match = declarations.find((candidate) =>
    !candidate.used
    && (
      (toolId !== null && candidate.declaration.toolId === toolId)
      || (
        toolId === null
        && declarationId !== null
        && candidate.declaration.toolId === null
        && candidate.declaration.declarationId === declarationId
      )
      || (
        toolId === null
        && declarationId === null
        && candidate.declaration.toolId === null
      )
    ));
  if (!match) {
    return null;
  }
  match.used = true;
  return match.declaration;
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

const codeArtifactRuntimeAssistantEffectProcessor =
  createCodeArtifactRuntimeAssistantEffectProcessor();

export function registerCodeArtifactRuntimeAssistantEffectProcessor(): void {
  registerRuntimeInvocationAssistantEffectProcessor(
    codeArtifactRuntimeAssistantEffectProcessor,
  );
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
