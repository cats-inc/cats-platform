/**
 * Deterministic mention parsing — extracts @mentions from message text.
 * This module is consumed by both the message model (for persisting mentions)
 * and the mention router (for routing decisions).
 */

export interface MentionParseResult {
  /** Unique mention names (without the @ prefix) */
  names: string[];
  /** Raw match positions for future use (e.g., UI highlighting) */
  positions: Array<{ name: string; start: number; end: number }>;
}

const MENTION_REGEX = /(?<!\w)@([\p{L}\p{N}._-]+)/gu;

/**
 * Parse @mentions from text, returning unique names (without @).
 * Case-preserving — comparison should be case-insensitive at the routing layer.
 */
export function parseMentions(text: string): string[] {
  return Array.from(
    new Set(
      text.match(MENTION_REGEX)?.map((value) => value.slice(1)) ?? [],
    ),
  );
}

/**
 * Parse @mentions with position information for richer downstream use.
 */
export function parseMentionsWithPositions(text: string): MentionParseResult {
  const seen = new Set<string>();
  const names: string[] = [];
  const positions: MentionParseResult['positions'] = [];

  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    positions.push({ name, start: match.index, end: match.index + match[0].length });
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return { names, positions };
}
