export const SKILL_PROFILES = [
  { value: 'chat-default', label: 'Default' },
  { value: 'companion', label: 'Companion' },
] as const;

export const MEMORY_CATEGORIES = [
  'preference', 'fact', 'policy', 'style', 'relationship', 'lesson',
] as const;

export function formatTransportTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
