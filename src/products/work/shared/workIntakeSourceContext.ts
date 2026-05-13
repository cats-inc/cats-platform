import type {
  WorkItemSourceRef,
  WorkToolSourceSurface,
} from './workToolSurface.js';

export interface BuildWorkIntakeSourceContextInput {
  surface: WorkToolSourceSurface;
  conversationId?: string | null;
  channelId?: string | null;
  transportBindingId?: string | null;
  sourceMessageId?: string | null;
  sourceText?: string | null;
}

export interface WorkIntakeSourceContext {
  sourceRef: WorkItemSourceRef;
  contextRefs: string[];
  metadata: {
    phase: 'intake';
    surface: WorkToolSourceSurface;
    conversationId: string | null;
    channelId: string | null;
    transportBindingId: string | null;
    sourceMessageId: string | null;
  };
}

export function buildWorkIntakeSourceContext(
  input: BuildWorkIntakeSourceContextInput,
): WorkIntakeSourceContext {
  const sourceRef: WorkItemSourceRef = {
    surface: input.surface,
    conversationId: normalizeOptionalString(input.conversationId),
    channelId: normalizeOptionalString(input.channelId),
    transportBindingId: normalizeOptionalString(input.transportBindingId),
    sourceMessageId: normalizeOptionalString(input.sourceMessageId),
    sourceText: normalizeOptionalString(input.sourceText),
  };

  return {
    sourceRef,
    contextRefs: buildContextRefs(sourceRef),
    metadata: {
      phase: 'intake',
      surface: sourceRef.surface,
      conversationId: sourceRef.conversationId ?? null,
      channelId: sourceRef.channelId ?? null,
      transportBindingId: sourceRef.transportBindingId ?? null,
      sourceMessageId: sourceRef.sourceMessageId ?? null,
    },
  };
}

function buildContextRefs(sourceRef: WorkItemSourceRef): string[] {
  return [
    `work-intake-surface:${sourceRef.surface}`,
    sourceRef.conversationId ? `work-intake-conversation:${sourceRef.conversationId}` : null,
    sourceRef.channelId ? `work-intake-channel:${sourceRef.channelId}` : null,
    sourceRef.transportBindingId
      ? `work-intake-transport-binding:${sourceRef.transportBindingId}`
      : null,
    sourceRef.sourceMessageId ? `work-intake-source-message:${sourceRef.sourceMessageId}` : null,
  ].filter((value): value is string => value !== null);
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
