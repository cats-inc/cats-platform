import type {
  RuntimeMessageSegment,
  RuntimeSessionInvocationContext,
} from '../../../platform/runtime/client.js';
import {
  CODE_ARTIFACT_DECLARATION_ONBOARDING_BLOCK_VERSION,
  CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION,
  CODE_ARTIFACT_DECLARATION_TOOL,
  CODE_ARTIFACT_DECLARATION_TOOL_NAME,
  CODE_ARTIFACT_PRODUCER_LABELS,
  CodeArtifactDeclarationError,
  type CodeArtifactDeclarationErrorCode,
} from '../shared/artifactDeclaration.js';

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

export interface CodeArtifactRuntimeToolingChannel {
  originSurface?: unknown;
  id?: string | null;
  title?: string | null;
  chatCwd?: string | null;
}

export interface RuntimeInvocationWithCodeArtifactTooling {
  instructions?: string | null;
  context?: RuntimeSessionInvocationContext;
}

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

export function withCodeArtifactRuntimeTooling<
  TInput extends RuntimeInvocationWithCodeArtifactTooling,
>(
  input: TInput,
  channel: CodeArtifactRuntimeToolingChannel,
): TInput {
  if (!shouldAttachCodeArtifactRuntimeTooling(channel)) {
    return input;
  }

  const onboardingBlock = buildCodeArtifactOnboardingBlock();
  const context = withCodeArtifactRuntimeContext(input.context, channel);

  return {
    ...input,
    instructions: appendCodeArtifactInstructions(input.instructions, onboardingBlock),
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
    if (
      segment.kind !== 'tool_use'
      || segment.toolName !== CODE_ARTIFACT_DECLARATION_TOOL_NAME
    ) {
      continue;
    }

    const toolArgs = readToolUseArguments(segment);
    try {
      const normalized = CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput(toolArgs);
      summaries.push({
        toolName: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
        toolId: segment.toolId ?? null,
        declarationId: normalized.declarationId,
        status: 'shape_ok',
      });
    } catch (error) {
      const declarationError = error instanceof CodeArtifactDeclarationError
        ? error
        : new CodeArtifactDeclarationError(
          'artifact_metadata_invalid',
          error instanceof Error ? error.message : String(error),
        );
      summaries.push({
        toolName: CODE_ARTIFACT_DECLARATION_TOOL_NAME,
        toolId: segment.toolId ?? null,
        declarationId: readDeclarationId(toolArgs),
        status: 'rejected',
        errorCode: declarationError.code,
        message: declarationError.message,
      });
    }
  }

  return summaries;
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
  if (existingText.includes(versionStamp)) {
    return existingText;
  }
  if (!existingText) {
    return onboardingBlock;
  }
  return `${existingText}\n\n${onboardingBlock}`;
}

function readToolUseArguments(segment: RuntimeMessageSegment): unknown {
  if (
    segment.toolArgs
    && typeof segment.toolArgs === 'object'
    && !Array.isArray(segment.toolArgs)
  ) {
    return segment.toolArgs;
  }

  const raw = segment.text.trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
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
