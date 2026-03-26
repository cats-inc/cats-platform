/**
 * Derive 1-2 character initials from a display name.
 * Two-word names use the first letter of each word; single words use the first two characters.
 */
export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
