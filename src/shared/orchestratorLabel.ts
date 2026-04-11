import { buildExecutionLabel } from './executionLabel.js';

export function isInternalOrchestratorLabel(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  return normalized === 'Chat' || normalized === 'Orchestrator';
}

export function normalizeVisibleOrchestratorLabel(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  if (!normalized || isInternalOrchestratorLabel(normalized)) {
    return null;
  }
  return normalized;
}

export function resolveVisibleOrchestratorLabel(input: {
  displayName?: string | null;
  executionLabel?: string | null;
  provider?: string | null;
  instance?: string | null;
}): string | null {
  return normalizeVisibleOrchestratorLabel(input.displayName)
    ?? normalizeVisibleOrchestratorLabel(input.executionLabel)
    ?? (
      input.provider
        ? buildExecutionLabel(input.provider, input.instance ?? null, null)
        : null
    );
}
