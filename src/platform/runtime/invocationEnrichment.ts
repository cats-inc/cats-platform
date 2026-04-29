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

type DistributiveOmit<TInput, TKey extends keyof any> = TInput extends unknown
  ? Omit<TInput, TKey>
  : never;

export type RuntimeInvocationEnrichmentResult<
  TInput extends RuntimeInvocationEnrichmentInput,
> = DistributiveOmit<TInput, 'instructions' | 'context'> & {
  instructions?: string | null;
  context?: RuntimeSessionInvocationContext;
};

export interface RuntimeInvocationEnrichmentContext {
  phase: RuntimeInvocationEnrichmentPhase;
}

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
  ): RuntimeInvocationEnrichmentInput;
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
    const priorityDelta = (left.priority ?? 0) - (right.priority ?? 0);
    return priorityDelta !== 0 ? priorityDelta : left.id.localeCompare(right.id);
  });
}

export function enrichRuntimeInvocation<TInput extends RuntimeInvocationEnrichmentInput>(
  channel: RuntimeInvocationEnrichmentChannel,
  input: TInput,
  context: RuntimeInvocationEnrichmentContext,
): RuntimeInvocationEnrichmentResult<TInput> {
  let current: RuntimeInvocationEnrichmentInput = { ...input };

  for (const enricher of getOrderedRuntimeInvocationEnrichers()) {
    current = enricher.enrich(channel, current, context);
  }

  return current as RuntimeInvocationEnrichmentResult<TInput>;
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
