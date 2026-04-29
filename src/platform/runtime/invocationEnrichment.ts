import type {
  RuntimeMessageSegment,
  RuntimeSessionInvocationContext,
} from './client.js';

export type RuntimeInvocationEnrichmentPhase = 'session_create' | 'message_send';

export interface RuntimeInvocationEnrichmentChannel {
  originSurface?: unknown;
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

export function enrichRuntimeInvocation<TInput extends RuntimeInvocationEnrichmentInput>(
  channel: RuntimeInvocationEnrichmentChannel,
  input: TInput,
  context: RuntimeInvocationEnrichmentContext,
): RuntimeInvocationEnrichmentResult<TInput> {
  let current: RuntimeInvocationEnrichmentInput = { ...input };

  for (const enricher of runtimeInvocationEnrichers.values()) {
    current = enricher.enrich(channel, current, context);
  }

  return current as RuntimeInvocationEnrichmentResult<TInput>;
}

export function collectRuntimeInvocationAssistantMetadata(
  channel: RuntimeInvocationEnrichmentChannel,
  segments: readonly RuntimeMessageSegment[],
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  for (const enricher of runtimeInvocationEnrichers.values()) {
    const contribution = enricher.collectAssistantMetadata?.(channel, segments);
    if (contribution) {
      Object.assign(metadata, contribution);
    }
  }

  return metadata;
}
