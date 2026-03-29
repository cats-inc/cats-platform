export function formatSessionStartedMessage(
  displayName: string,
  session: { id: string; cwd?: string | null },
): string {
  const cwd = typeof session.cwd === 'string' && session.cwd.trim().length > 0
    ? session.cwd
    : 'unavailable';
  return `${displayName} connected to cats-runtime session ${session.id}.\n(cwd: ${cwd})`;
}
