import type { RuntimeInvocationEnrichmentChannel } from './invocationEnrichment.js';

export interface RuntimeAssistantFinalizationInput {
  assistantTurnId: string;
  bodyText: string;
  runtimeFinalization?: Record<string, unknown> | null;
  runtimeAssistantMetadata?: Record<string, unknown> | null;
}

export type RuntimeAssistantFinalizationGateDecision =
  | {
      status: 'accepted';
      metadata?: Record<string, unknown> | null;
    }
  | {
      status: 'rejected';
      code: string;
      message: string;
      metadata?: Record<string, unknown> | null;
    };

export type RuntimeAssistantFinalizationResult =
  | {
      status: 'accepted';
      metadata: Record<string, unknown>;
    }
  | {
      status: 'rejected';
      gateId: string;
      code: string;
      message: string;
      metadata: Record<string, unknown>;
    };

export interface RuntimeAssistantFinalizationGate {
  id: string;
  priority?: number;
  shouldEvaluate?(
    channel: RuntimeInvocationEnrichmentChannel,
    input: RuntimeAssistantFinalizationInput,
  ): boolean;
  evaluate(
    channel: RuntimeInvocationEnrichmentChannel,
    input: RuntimeAssistantFinalizationInput,
  ): RuntimeAssistantFinalizationGateDecision;
}

const runtimeAssistantFinalizationGates = new Map<string, RuntimeAssistantFinalizationGate>();

export function registerRuntimeAssistantFinalizationGate(
  gate: RuntimeAssistantFinalizationGate,
): void {
  runtimeAssistantFinalizationGates.set(gate.id, gate);
}

export function clearRuntimeAssistantFinalizationGates(): void {
  runtimeAssistantFinalizationGates.clear();
}

export function hasRuntimeAssistantFinalizationGates(): boolean {
  return runtimeAssistantFinalizationGates.size > 0;
}

function getOrderedRuntimeAssistantFinalizationGates(): RuntimeAssistantFinalizationGate[] {
  return [...runtimeAssistantFinalizationGates.values()].sort((left, right) => {
    const priorityDelta = (left.priority ?? 0) - (right.priority ?? 0);
    return priorityDelta !== 0 ? priorityDelta : left.id.localeCompare(right.id);
  });
}

export function applyRuntimeAssistantFinalizationGates(
  channel: RuntimeInvocationEnrichmentChannel,
  input: RuntimeAssistantFinalizationInput,
): RuntimeAssistantFinalizationResult {
  const metadata: Record<string, unknown> = {};

  for (const gate of getOrderedRuntimeAssistantFinalizationGates()) {
    if (gate.shouldEvaluate && !gate.shouldEvaluate(channel, input)) {
      continue;
    }
    const decision = gate.evaluate(channel, input);
    if (decision.metadata) {
      metadata[gate.id] = decision.metadata;
    }
    if (decision.status === 'rejected') {
      return {
        status: 'rejected',
        gateId: gate.id,
        code: decision.code,
        message: decision.message,
        metadata,
      };
    }
  }

  return {
    status: 'accepted',
    metadata,
  };
}
