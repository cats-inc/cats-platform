import type {
  CatsCoreState,
} from '../../core/types.js';
import type {
  RuntimeMessageSegment,
  RuntimeSessionInvocationContext,
} from './client.js';
import { clearRuntimeAssistantFinalizationGates } from './assistantFinalization.js';

export type RuntimeInvocationEnrichmentPhase = 'session_create' | 'message_send';

export interface RuntimeInvocationEnrichmentChannel {
  originSurface?: string | null;
  id?: string | null;
  title?: string | null;
  chatCwd?: string | null;
}

export interface RuntimeInvocationEnrichmentInput {
  instructions?: string | null;
  context?: RuntimeSessionInvocationContext;
}

type DistributiveOmit<TInput, TKey extends keyof any> = TInput extends unknown
  ? Omit<TInput, TKey>
  : never;

export type RuntimeInvocationEnrichmentResult<
  TInput extends RuntimeInvocationEnrichmentInput,
> = DistributiveOmit<TInput, 'instructions' | 'context'> & RuntimeInvocationEnrichmentInput;

export interface RuntimeInvocationEnrichmentContext {
  phase: RuntimeInvocationEnrichmentPhase;
}

export const RuntimeEnricherPriority = {
  EARLY: -100,
  NORMAL: 0,
  POST_PROCESS: 100,
} as const;

export interface RuntimeInvocationContextContribution
  extends Omit<Partial<RuntimeSessionInvocationContext>, 'labels' | 'metadata' | 'workspace'> {
  labels?: readonly string[];
  metadata?: Record<string, unknown>;
  workspace?: RuntimeSessionInvocationContext['workspace'];
}

export interface RuntimeInvocationEnrichmentContributionFields {
  /**
   * `undefined` means "leave unchanged"; `null` explicitly clears the
   * instruction text for the outgoing runtime invocation.
   */
  instructions?: string | null;
  /**
   * Context contributions are merged by the platform. Labels are appended with
   * de-duplication, metadata is merged by top-level key, and workspace fields
   * are merged shallowly. `undefined` leaves context unchanged. Metadata values
   * must be structured-cloneable.
   */
  context?: RuntimeInvocationContextContribution;
}

export type RuntimeInvocationEnrichmentContribution =
  | RuntimeInvocationEnrichmentContributionFields
  | null
  | undefined;

export interface RuntimeInvocationEnricher {
  id: string;
  /**
   * Lower values run first. Equal-priority enrichers are ordered by id so the
   * runtime contract is deterministic across import and registration timing.
   */
  priority?: number;
  enrich(
    channel: RuntimeInvocationEnrichmentChannel,
    input: RuntimeInvocationEnrichmentInput,
    context: RuntimeInvocationEnrichmentContext,
  ): RuntimeInvocationEnrichmentContribution;
  collectAssistantMetadata?(
    channel: RuntimeInvocationEnrichmentChannel,
    segments: readonly RuntimeMessageSegment[],
  ): Record<string, unknown> | null;
}

export interface RuntimeInvocationAssistantEffectContext {
  runtimeContext?: RuntimeSessionInvocationContext;
  runtimeSessionId?: string | null;
  actorId?: string | null;
  now?: Date;
}

export interface RuntimeInvocationAssistantEffectInput {
  core: CatsCoreState;
  segments: readonly RuntimeMessageSegment[];
}

export interface RuntimeInvocationAssistantEffectContribution {
  core: CatsCoreState;
  segments?: readonly RuntimeMessageSegment[] | null;
  metadata?: Record<string, unknown> | null;
}

export interface RuntimeInvocationAssistantEffectResult {
  core: CatsCoreState;
  segments: RuntimeMessageSegment[];
  metadata: Record<string, unknown>;
}

export interface RuntimeInvocationAssistantEffectProcessor {
  id: string;
  priority?: number;
  /**
   * Return true only when this assistant turn may produce effects. Dispatchers
   * use this predicate to avoid opening a core write for ordinary assistant
   * replies. Processors without a predicate are treated as interested whenever
   * the turn has at least one runtime segment.
   */
  shouldApplyAssistantEffects?(
    channel: RuntimeInvocationEnrichmentChannel,
    segments: readonly RuntimeMessageSegment[],
  ): boolean;
  applyAssistantEffects(
    channel: RuntimeInvocationEnrichmentChannel,
    input: RuntimeInvocationAssistantEffectInput,
    context: RuntimeInvocationAssistantEffectContext,
  ): RuntimeInvocationAssistantEffectContribution | null | undefined;
}

export class RuntimeEnrichmentCloneError extends Error {
  readonly scope: string;
  readonly enricherId: string | null;

  constructor(scope: string, enricherId?: string | null) {
    super(
      `${scope} contains non-structured-cloneable context values; runtime invocation metadata ` +
      'must not contain functions, class instances, Maps, Sets, or other unsupported values.',
    );
    this.name = 'RuntimeEnrichmentCloneError';
    this.scope = scope;
    this.enricherId = enricherId ?? null;
  }
}

const runtimeInvocationEnrichers = new Map<string, RuntimeInvocationEnricher>();
const runtimeInvocationAssistantEffectProcessors =
  new Map<string, RuntimeInvocationAssistantEffectProcessor>();

export function registerRuntimeInvocationEnricher(enricher: RuntimeInvocationEnricher): void {
  runtimeInvocationEnrichers.set(enricher.id, enricher);
}

export function clearRuntimeInvocationEnrichers(): void {
  runtimeInvocationEnrichers.clear();
  runtimeInvocationAssistantEffectProcessors.clear();
  clearRuntimeAssistantFinalizationGates();
}

export function registerRuntimeInvocationAssistantEffectProcessor(
  processor: RuntimeInvocationAssistantEffectProcessor,
): void {
  runtimeInvocationAssistantEffectProcessors.set(processor.id, processor);
}

export function clearRuntimeInvocationAssistantEffectProcessors(): void {
  runtimeInvocationAssistantEffectProcessors.clear();
}

export function hasRuntimeInvocationAssistantEffectProcessors(): boolean {
  return runtimeInvocationAssistantEffectProcessors.size > 0;
}

export function hasRuntimeInvocationAssistantEffects(
  channel: RuntimeInvocationEnrichmentChannel,
  segments: readonly RuntimeMessageSegment[],
): boolean {
  return segments.length > 0
    && getOrderedRuntimeInvocationAssistantEffectProcessors().some((processor) =>
      processor.shouldApplyAssistantEffects
        ? processor.shouldApplyAssistantEffects(channel, segments)
        : true);
}

function getOrderedRuntimeInvocationEnrichers(): RuntimeInvocationEnricher[] {
  return [...runtimeInvocationEnrichers.values()].sort((left, right) => {
    const priorityDelta =
      (left.priority ?? RuntimeEnricherPriority.NORMAL)
      - (right.priority ?? RuntimeEnricherPriority.NORMAL);
    return priorityDelta !== 0 ? priorityDelta : left.id.localeCompare(right.id);
  });
}

function getOrderedRuntimeInvocationAssistantEffectProcessors(): RuntimeInvocationAssistantEffectProcessor[] {
  return [...runtimeInvocationAssistantEffectProcessors.values()].sort((left, right) => {
    const priorityDelta =
      (left.priority ?? RuntimeEnricherPriority.NORMAL)
      - (right.priority ?? RuntimeEnricherPriority.NORMAL);
    return priorityDelta !== 0 ? priorityDelta : left.id.localeCompare(right.id);
  });
}

function cloneRuntimeSessionInvocationContext(
  context: RuntimeSessionInvocationContext | undefined,
  scope: string,
): RuntimeSessionInvocationContext | undefined {
  if (!context) {
    return undefined;
  }
  try {
    return structuredClone(context) as RuntimeSessionInvocationContext;
  } catch {
    throw new RuntimeEnrichmentCloneError(scope);
  }
}

function cloneRuntimeInvocationContextContribution(
  contribution: RuntimeInvocationContextContribution,
  enricherId: string,
): RuntimeInvocationContextContribution {
  try {
    return structuredClone(contribution) as RuntimeInvocationContextContribution;
  } catch {
    throw new RuntimeEnrichmentCloneError(
      `Runtime enricher "${enricherId}" contribution`,
      enricherId,
    );
  }
}

function cloneRuntimeInvocationEnrichmentContribution(
  contribution: RuntimeInvocationEnrichmentContribution,
  enricherId: string,
): RuntimeInvocationEnrichmentContribution {
  if (!contribution || !contribution.context) {
    return contribution;
  }
  return {
    ...contribution,
    context: cloneRuntimeInvocationContextContribution(contribution.context, enricherId),
  };
}

function cloneRuntimeInvocationEnricherInput(
  input: RuntimeInvocationEnrichmentInput,
  enricherId: string,
): RuntimeInvocationEnrichmentInput {
  return {
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    ...(input.context
      ? {
          context: cloneRuntimeSessionInvocationContext(
            input.context,
            `Runtime enricher "${enricherId}" input`,
          ),
        }
      : {}),
  };
}

function cloneRuntimeInvocationEnrichmentResult<
  TInput extends RuntimeInvocationEnrichmentInput,
>(
  input: TInput,
): RuntimeInvocationEnrichmentResult<TInput> {
  // TypeScript cannot prove that cloning/replacing the optional context still
  // satisfies the distributive Omit result for every generic TInput.
  const result = { ...input } as unknown as RuntimeInvocationEnrichmentResult<TInput>;
  if (input.context) {
    result.context = cloneRuntimeSessionInvocationContext(
      input.context,
      'Runtime invocation input',
    );
  }
  return result;
}

function mergeDefinedProperties<TRecord extends Record<string, unknown>>(
  left: TRecord | undefined,
  right: TRecord | undefined,
): TRecord | undefined {
  if (!right) {
    return left ? ({ ...left } as TRecord) : undefined;
  }

  const merged: Record<string, unknown> = { ...(left ?? {}) };
  for (const [key, value] of Object.entries(right)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as TRecord;
}

function mergeRuntimeInvocationContextContribution(
  current: RuntimeSessionInvocationContext | undefined,
  contribution: RuntimeInvocationContextContribution | undefined,
): RuntimeSessionInvocationContext | undefined {
  if (!contribution) {
    return current
      ? cloneRuntimeSessionInvocationContext(current, 'Runtime invocation context')
      : undefined;
  }

  const merged: RuntimeSessionInvocationContext = {
    ...(current ?? {}),
  };
  if (contribution.source !== undefined) {
    merged.source = contribution.source;
  }
  if (contribution.reason !== undefined) {
    merged.reason = contribution.reason;
  }
  if (contribution.taskId !== undefined) {
    merged.taskId = contribution.taskId;
  }
  if (contribution.issueId !== undefined) {
    merged.issueId = contribution.issueId;
  }
  if (contribution.commentId !== undefined) {
    merged.commentId = contribution.commentId;
  }
  if (contribution.approvalId !== undefined) {
    merged.approvalId = contribution.approvalId;
  }

  if (contribution.workspace) {
    merged.workspace = mergeDefinedProperties(
      current?.workspace,
      contribution.workspace,
    );
  } else if (current?.workspace) {
    merged.workspace = { ...current.workspace };
  }

  if (contribution.labels) {
    merged.labels = [...new Set([...(current?.labels ?? []), ...contribution.labels])];
  } else if (current?.labels) {
    merged.labels = [...current.labels];
  }

  if (contribution.metadata) {
    merged.metadata = mergeDefinedProperties(current?.metadata, contribution.metadata);
  } else if (current?.metadata) {
    merged.metadata = { ...current.metadata };
  }

  return merged;
}

export function mergeRuntimeInvocationEnrichmentContribution<
  TInput extends RuntimeInvocationEnrichmentInput,
>(
  current: RuntimeInvocationEnrichmentResult<TInput>,
  contribution: RuntimeInvocationEnrichmentContribution,
): RuntimeInvocationEnrichmentResult<TInput> {
  if (!contribution || Object.keys(contribution).length === 0) {
    return current;
  }

  const next: RuntimeInvocationEnrichmentResult<TInput> = { ...current };
  if (
    Object.prototype.hasOwnProperty.call(contribution, 'instructions')
    && contribution.instructions !== undefined
  ) {
    next.instructions = contribution.instructions;
  }
  if (
    Object.prototype.hasOwnProperty.call(contribution, 'context')
    && contribution.context
  ) {
    next.context = mergeRuntimeInvocationContextContribution(current.context, contribution.context);
  }
  return next;
}

export function enrichRuntimeInvocation<TInput extends RuntimeInvocationEnrichmentInput>(
  channel: RuntimeInvocationEnrichmentChannel,
  input: TInput,
  context: RuntimeInvocationEnrichmentContext,
): RuntimeInvocationEnrichmentResult<TInput> {
  let current = cloneRuntimeInvocationEnrichmentResult(input);

  for (const enricher of getOrderedRuntimeInvocationEnrichers()) {
    const contribution = cloneRuntimeInvocationEnrichmentContribution(
      enricher.enrich(channel, cloneRuntimeInvocationEnricherInput(current, enricher.id), context),
      enricher.id,
    );
    current = mergeRuntimeInvocationEnrichmentContribution(
      current,
      contribution,
    );
  }

  return current;
}

export function collectRuntimeInvocationAssistantMetadata(
  channel: RuntimeInvocationEnrichmentChannel,
  segments: readonly RuntimeMessageSegment[],
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  for (const enricher of getOrderedRuntimeInvocationEnrichers()) {
    const contribution = enricher.collectAssistantMetadata?.(channel, segments);
    if (contribution) {
      metadata[enricher.id] = contribution;
    }
  }

  return metadata;
}

export function applyRuntimeInvocationAssistantEffects(
  channel: RuntimeInvocationEnrichmentChannel,
  input: RuntimeInvocationAssistantEffectInput,
  context: RuntimeInvocationAssistantEffectContext,
): RuntimeInvocationAssistantEffectResult {
  let currentCore = input.core;
  let currentSegments = [...input.segments];
  const metadata: Record<string, unknown> = {};

  for (const processor of getOrderedRuntimeInvocationAssistantEffectProcessors()) {
    if (
      processor.shouldApplyAssistantEffects
      && !processor.shouldApplyAssistantEffects(channel, input.segments)
    ) {
      continue;
    }
    const contribution = processor.applyAssistantEffects(
      channel,
      {
        core: currentCore,
        segments: currentSegments,
      },
      context,
    );
    if (!contribution) {
      continue;
    }
    currentCore = contribution.core;
    if (contribution.segments) {
      currentSegments = [...contribution.segments];
    }
    if (contribution.metadata) {
      metadata[processor.id] = contribution.metadata;
    }
  }

  return {
    core: currentCore,
    segments: currentSegments,
    metadata,
  };
}
