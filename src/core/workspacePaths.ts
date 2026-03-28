function normalizeWorkspacePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isRuntimeSessionWorkspacePath(value: string | null | undefined): boolean {
  const normalized = normalizeWorkspacePath(value);
  if (!normalized) {
    return false;
  }

  return normalized.replace(/\\/g, '/').includes('/.cats-runtime/sessions/');
}

export function resolveComposerWorkspacePath(
  repoPath: string | null | undefined,
  chatCwd: string | null | undefined,
): string | null {
  const normalizedRepoPath = normalizeWorkspacePath(repoPath);
  if (normalizedRepoPath) {
    return normalizedRepoPath;
  }

  const normalizedChatCwd = normalizeWorkspacePath(chatCwd);
  if (!normalizedChatCwd || isRuntimeSessionWorkspacePath(normalizedChatCwd)) {
    return null;
  }

  return normalizedChatCwd;
}
