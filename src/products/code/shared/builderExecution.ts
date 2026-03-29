export function normalizeCodeBuilderTaskId(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCodeBuilderExecutionTaskId(
  currentTaskId: string | null,
  resumeTaskId: string | null | undefined,
): string | null {
  return normalizeCodeBuilderTaskId(currentTaskId)
    ?? normalizeCodeBuilderTaskId(resumeTaskId);
}
