import type {
  RuntimeMessageSegment,
  RuntimeSessionInvocationContext,
} from './client.js';

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

export type RuntimeInvocationEnrichmentResult<
  TInput extends RuntimeInvocationEnrichmentInput,
> = TInput & RuntimeInvocationEnrichmentInput;

export interface RuntimeInvocationEnrichmentContext {
  phase: RuntimeInvocationEnrichmentPhase;
}

export const RuntimeEnricherPriority = {
  EARLY: -100,
  NORMAL: 0,
  POST_PROCESS: 100,
} as const;

export type RuntimeInvocationEnrichmentContribution =
  | Partial<RuntimeInvocationEnrichmentInput>
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
    input: Readonly<RuntimeInvocationEnrichmentInput>,
    context: RuntimeInvocationEnrichmentContext,
  ): RuntimeInvocationEnrichmentContribution;
  collectAssistantMetadata?(
    channel: RuntimeInvocationEnrichmentChannel,
    segments: readonly RuntimeMessageSegment[],
  ): Record<string, unknown> | null;
}

const runtimeInvocationEnrichers = new Map<string, RuntimeInvocationEnricher>();

export function registerRuntimeInvocationEnricher(enricher: RuntimeInvocationEnricher): void {
  runtimeInvocationEnrichers.set(enricher.id, enricher);
}

export function clearRuntimeInvocationEnrichers(): void {
  runtimeInvocationEnrichers.clear();
}

function getOrderedRuntimeInvocationEnrichers(): RuntimeInvocationEnricher[] {
  return [...runtimeInvocationEnrichers.values()].sort((left, right) => {
    const priorityDelta =
      (left.priority ?? RuntimeEnricherPriority.NORMAL)
      - (right.priority ?? RuntimeEnricherPriority.NORMAL);
    return priorityDelta !== 0 ? priorityDelta : left.id.localeCompare(right.id);
  });
}

function applyRuntimeInvocationEnrichmentContribution<
  TInput extends RuntimeInvocationEnrichmentInput,
>(
  current: RuntimeInvocationEnrichmentResult<TInput>,
  contribution: RuntimeInvocationEnrichmentContribution,
): RuntimeInvocationEnrichmentResult<TInput> {
  if (!contribution || Object.keys(contribution).length === 0) {
    return current;
  }

  return {
    ...current,
    ...contribution,
  };
}

export function enrichRuntimeInvocation<TInput extends RuntimeInvocationEnrichmentInput>(
  channel: RuntimeInvocationEnrichmentChannel,
  input: TInput,
  context: RuntimeInvocationEnrichmentContext,
): RuntimeInvocationEnrichmentResult<TInput> {
  let current: RuntimeInvocationEnrichmentResult<TInput> = { ...input };

  for (const enricher of getOrderedRuntimeInvocationEnrichers()) {
    current = applyRuntimeInvocationEnrichmentContribution(
      current,
      enricher.enrich(channel, current, context),
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
