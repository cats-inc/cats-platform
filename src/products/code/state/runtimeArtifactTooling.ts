import type {
  RuntimeMessageSegment,
  RuntimeSessionInvocationContext,
  RuntimeToolUseSegment,
} from '../../../platform/runtime/client.js';
import {
  RuntimeEnricherPriority,
  mergeRuntimeInvocationEnrichmentContribution,
  registerRuntimeInvocationEnricher,
  type RuntimeInvocationEnricher,
  type RuntimeInvocationEnrichmentChannel,
  type RuntimeInvocationEnrichmentContribution,
  type RuntimeInvocationEnrichmentContext,
  type RuntimeInvocationEnrichmentInput,
  type RuntimeInvocationEnrichmentResult,
} from '../../../platform/runtime/invocationEnrichment.js';
import {
  CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION,
  CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION,
  CODE_ARTIFACT_DECLARATION_TOOL,
  CODE_ARTIFACT_DECLARATION_TOOL_NAME,
  CODE_ARTIFACT_PRODUCER_LABELS,
  CodeArtifactDeclarationError,
  type CodeArtifactDeclarationErrorCode,
  type CodeArtifactToolInput,
} from '../shared/artifactDeclaration.js';

export const CODE_ARTIFACT_RUNTIME_HOOK_ID = 'cats-code.artifact-declaration' as const;
export const CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY = 'codeArtifactDeclaration' as const;

const AGENT_VISIBLE_DECLARATION_FIELDS = [
  'declarationId',
  'label',
  'title',
  'location',
  'summary',
  'metadata',
] as const;

const POSITIVE_ARTIFACT_EXAMPLES = [
  'preview URLs',
  'build outputs',
  'test reports',
  'review reports',
  'implementation / diff / changed-files summaries',
  'patch bundles',
  'screenshots or wireframes',
  'spec or plan documents',
  'transcript exports',
  'dataset files',
] as const;

const NEGATIVE_ARTIFACT_EXAMPLES = [
  'ordinary source edits',
  'scratch notes',
  'dependency caches',
  'temporary logs',
  'lockfiles',
  'generic conversation text',
  'plans or promises for work not produced yet',
] as const;

export type CodeArtifactRuntimeToolingChannel = RuntimeInvocationEnrichmentChannel;
export type RuntimeInvocationWithCodeArtifactTooling = RuntimeInvocationEnrichmentInput;

export type RuntimeInvocationWithCodeArtifactToolingResult<
  TInput extends RuntimeInvocationWithCodeArtifactTooling =
    RuntimeInvocationWithCodeArtifactTooling,
> = RuntimeInvocationEnrichmentResult<TInput>;

export interface CodeArtifactRuntimeToolingMetadata {
  enabled: true;
  owner: 'cats-code';
  channel: 'runtime_tool';
  toolName: typeof CODE_ARTIFACT_DECLARATION_TOOL_NAME;
  schemaVersion: typeof CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION;
  onboardingBlockVersion: typeof CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION;
  agentVisibleFields: readonly (typeof AGENT_VISIBLE_DECLARATION_FIELDS)[number][];
  producerLabels: readonly string[];
  finalization: {
    envelope: 'CodeAssistantFinalization';
    sameTurnAcceptedDeclarationsRequired: true;
    claimField: 'artifactClaims';
  };
  sourceChannelId?: string | null;
  sourceChannelTitle?: string | null;
  workspacePath?: string | null;
}

export interface CodeArtifactRuntimeToolCallSummary {
  toolName: typeof CODE_ARTIFACT_DECLARATION_TOOL_NAME;
  toolId: string | null;
  declarationId: string | null;
  status: 'shape_ok' | 'rejected';
  errorCode?: CodeArtifactDeclarationErrorCode;
  message?: string;
}

export type CodeArtifactRuntimeToolCallObservation =
  | (CodeArtifactRuntimeToolCallSummary & {
      status: 'shape_ok';
      input: CodeArtifactToolInput;
    })
  | (CodeArtifactRuntimeToolCallSummary & {
      status: 'rejected';
    });

export function shouldAttachCodeArtifactRuntimeTooling(
  channel: CodeArtifactRuntimeToolingChannel,
): boolean {
  return channel.originSurface === 'code';
}

export function buildCodeArtifactRuntimeToolingMetadata(
  channel: CodeArtifactRuntimeToolingChannel,
): CodeArtifactRuntimeToolingMetadata {
  return {
    enabled: true,
    owner: 'cats-code',
    channel: 'runtime_tool',
    toolName: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
    schemaVersion: CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION,
    onboardingBlockVersion: CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION,
    agentVisibleFields: AGENT_VISIBLE_DECLARATION_FIELDS,
    producerLabels: CODE_ARTIFACT_PRODUCER_LABELS,
    finalization: {
      envelope: 'CodeAssistantFinalization',
      sameTurnAcceptedDeclarationsRequired: true,
      claimField: 'artifactClaims',
    },
    sourceChannelId: channel.id ?? null,
    sourceChannelTitle: channel.title ?? null,
    workspacePath: channel.chatCwd ?? null,
  };
}

export function buildCodeArtifactOnboardingBlock(): string {
  const htmlVersionStamp =
    '<!-- cats-code:declare-artifact-onboarding:' +
    `${CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION} -->`;
  const metadataVersionStamp =
    'codeArtifactDeclaration.onboardingBlockVersion=' +
    CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION;
  return [
    htmlVersionStamp,
    metadataVersionStamp,
    'You can record durable outputs the user will want to find later by calling',
    `the ${CODE_ARTIFACT_DECLARATION_TOOL_NAME} tool.`,
    '',
    'Identify each output by its producer label, not by the Core artifact kind.',
    `Allowed labels: ${CODE_ARTIFACT_PRODUCER_LABELS.join(', ')}.`,
    `Declare outputs such as: ${POSITIVE_ARTIFACT_EXAMPLES.join('; ')}.`,
    `Do NOT declare: ${NEGATIVE_ARTIFACT_EXAMPLES.join('; ')}.`,
    '',
    'Use one declaration per durable output. Do not bundle unrelated outputs.',
    'Source-file edits in the workspace are workspace mutations, not artifacts.',
    `Each declaration may send only these fields: ${AGENT_VISIBLE_DECLARATION_FIELDS.join(', ')}.`,
    [
      'Do not send producer, anchors, conversationId, taskId, runId, projectId,',
      'workItemId, coreKind, kind, requestedStatus, or requestedDisposition.',
    ].join(' '),
    [
      'location.kind must be one of none, local_path, url, inline_summary,',
      'external_ref. URLs must not include credentials; local_path must refer',
      'to the active workspace.',
    ].join(' '),
    [
      'If your final response says you produced an artifact, the same assistant',
      'turn must have an accepted declaration and the finalization envelope must',
      'list artifactClaims[].',
    ].join(' '),
    [
      'Declare each artifact exactly once per logical output. Reuse the same',
      'declarationId across retries.',
    ].join(' '),
  ].join('\n');
}

export function createCodeArtifactRuntimeInvocationEnricher(): RuntimeInvocationEnricher {
  return {
    id: CODE_ARTIFACT_RUNTIME_HOOK_ID,
    priority: RuntimeEnricherPriority.POST_PROCESS,
    enrich(channel, input, context) {
      return buildCodeArtifactRuntimeInvocationContribution(input, channel, context);
    },
    collectAssistantMetadata(channel, segments) {
      const calls = collectCodeArtifactRuntimeToolCalls(channel, segments);
      return calls.length > 0 ? { codeArtifactToolCalls: calls } : null;
    },
  };
}

const codeArtifactRuntimeInvocationEnricher = createCodeArtifactRuntimeInvocationEnricher();

export function registerCodeArtifactRuntimeInvocationEnrichers(): void {
  registerRuntimeInvocationEnricher(codeArtifactRuntimeInvocationEnricher);
}

export function enrichCodeArtifactRuntimeInvocation<
  TInput extends RuntimeInvocationWithCodeArtifactTooling,
>(
  input: TInput,
  channel: CodeArtifactRuntimeToolingChannel,
  enrichmentContext: RuntimeInvocationEnrichmentContext,
): RuntimeInvocationWithCodeArtifactToolingResult<TInput>;
export function enrichCodeArtifactRuntimeInvocation(
  input: RuntimeInvocationWithCodeArtifactTooling,
  channel: CodeArtifactRuntimeToolingChannel,
  enrichmentContext: RuntimeInvocationEnrichmentContext,
): RuntimeInvocationWithCodeArtifactToolingResult {
  const contribution = codeArtifactRuntimeInvocationEnricher.enrich(
    channel,
    input,
    enrichmentContext,
  );
  return mergeRuntimeInvocationEnrichmentContribution(input, contribution);
}

function buildCodeArtifactRuntimeInvocationContribution(
  input: RuntimeInvocationWithCodeArtifactTooling,
  channel: CodeArtifactRuntimeToolingChannel,
  enrichmentContext: RuntimeInvocationEnrichmentContext,
): RuntimeInvocationEnrichmentContribution {
  if (!shouldAttachCodeArtifactRuntimeTooling(channel)) {
    return null;
  }

  const context = withCodeArtifactRuntimeContext(input.context, channel);
  const instructions = enrichmentContext.phase === 'session_create'
    ? appendCodeArtifactInstructions(input.instructions, buildCodeArtifactOnboardingBlock())
    : input.instructions;

  return {
    instructions,
    context,
  };
}

export function collectCodeArtifactRuntimeToolCalls(
  channel: CodeArtifactRuntimeToolingChannel,
  segments: readonly RuntimeMessageSegment[],
): CodeArtifactRuntimeToolCallSummary[] {
  if (!shouldAttachCodeArtifactRuntimeTooling(channel)) {
    return [];
  }

  const summaries: CodeArtifactRuntimeToolCallSummary[] = [];
  for (const segment of segments) {
    const observation = observeCodeArtifactRuntimeToolCall(segment);
    if (observation) {
      summaries.push(summarizeCodeArtifactRuntimeToolCallObservation(observation));
    }
  }

  return summaries;
}

export function observeCodeArtifactRuntimeToolCall(
  segment: RuntimeMessageSegment,
): CodeArtifactRuntimeToolCallObservation | null {
  if (
    segment.kind !== 'tool_use'
    || segment.toolName !== CODE_ARTIFACT_DECLARATION_TOOL_NAME
  ) {
    return null;
  }

  const toolArgs = readToolUseArguments(segment);
  if (!toolArgs.ok) {
    return {
      toolName: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
      toolId: segment.toolId ?? null,
      declarationId: null,
      status: 'rejected',
      errorCode: 'artifact_metadata_invalid',
      message: toolArgs.message,
    };
  }

  try {
    const normalized = CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput(toolArgs.value);
    return {
      toolName: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
      toolId: segment.toolId ?? null,
      declarationId: normalized.declarationId,
      status: 'shape_ok',
      input: normalized,
    };
  } catch (error) {
    const declarationError = error instanceof CodeArtifactDeclarationError
      ? error
      : new CodeArtifactDeclarationError(
        'artifact_metadata_invalid',
        error instanceof Error ? error.message : String(error),
      );
    return {
      toolName: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
      toolId: segment.toolId ?? null,
      declarationId: readDeclarationId(toolArgs.value),
      status: 'rejected',
      errorCode: declarationError.code,
      message: declarationError.message,
    };
  }
}

export function summarizeCodeArtifactRuntimeToolCallObservation(
  observation: CodeArtifactRuntimeToolCallObservation,
): CodeArtifactRuntimeToolCallSummary {
  if (observation.status === 'shape_ok') {
    return {
      toolName: observation.toolName,
      toolId: observation.toolId,
      declarationId: observation.declarationId,
      status: 'shape_ok',
    };
  }
  return observation;
}

function withCodeArtifactRuntimeContext(
  context: RuntimeSessionInvocationContext | undefined,
  channel: CodeArtifactRuntimeToolingChannel,
): RuntimeSessionInvocationContext {
  const labels = new Set(context?.labels ?? []);
  labels.add('product:code');
  labels.add(`runtime-tool:${CODE_ARTIFACT_DECLARATION_TOOL_NAME}`);
  labels.add(`code-artifact-onboarding:${CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION}`);

  return {
    ...(context ?? {}),
    labels: [...labels],
    metadata: {
      ...(context?.metadata ?? {}),
      [CODE_ARTIFACT_RUNTIME_CONTEXT_METADATA_KEY]:
        buildCodeArtifactRuntimeToolingMetadata(channel),
    },
  };
}

function appendCodeArtifactInstructions(
  existing: string | null | undefined,
  onboardingBlock: string,
): string {
  const existingText = existing?.trim() ?? '';
  const versionStamp =
    'codeArtifactDeclaration.onboardingBlockVersion=' +
    CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION;
  // Kept for future resume/compaction re-injection paths; normal session
  // creation sees this block once. Re-injection must strip any older
  // cats-code:declare-artifact-onboarding block before appending a new version.
  if (existingText.includes(versionStamp)) {
    return existingText;
  }
  if (!existingText) {
    return onboardingBlock;
  }
  return `${existingText}\n\n${onboardingBlock}`;
}

type ToolUseArgumentsReadResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

function readToolUseArguments(segment: RuntimeToolUseSegment): ToolUseArgumentsReadResult {
  if (
    segment.toolArgs
    && typeof segment.toolArgs === 'object'
    && !Array.isArray(segment.toolArgs)
  ) {
    return { ok: true, value: segment.toolArgs };
  }

  const raw = segment.text.trim();
  if (!raw) {
    return {
      ok: false,
      message: 'declare_artifact tool arguments must be a structured JSON object.',
    };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        message: 'declare_artifact tool arguments must be a structured JSON object.',
      };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      message: 'declare_artifact tool arguments must be valid JSON.',
    };
  }
}

function readDeclarationId(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const value = (input as Record<string, unknown>).declarationId;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}
