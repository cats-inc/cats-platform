/**
 * Deterministic mention parsing — extracts @mentions from message text.
 * This module is consumed by product-local renderers and message models.
 */

export interface MentionParseResult {
  /** Unique mention names (without the @ prefix) */
  names: string[];
  /** Raw match positions for future use (e.g., UI highlighting) */
  positions: Array<{ name: string; start: number; end: number }>;
}

export interface MentionParseOptions {
  excludedNames?: Iterable<string>;
}

const MENTION_REGEX = /(?<!\w)@([\p{L}\p{N}._-]+)/gu;

function buildExcludedMentionNameSet(
  options: MentionParseOptions | undefined,
): Set<string> {
  return new Set(
    Array.from(options?.excludedNames ?? [])
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
}

/**
 * Parse @mentions from text, returning unique names (without @).
 * Case-preserving — comparison should be case-insensitive at the routing layer.
 */
export function parseMentions(
  text: string,
  options?: MentionParseOptions,
): string[] {
  const excludedNames = buildExcludedMentionNameSet(options);
  return Array.from(
    new Set(
      (text.match(MENTION_REGEX)?.map((value) => value.slice(1)) ?? [])
        .filter((name) => !excludedNames.has(name.toLowerCase())),
    ),
  );
}

/**
 * Parse @mentions with position information for richer downstream use.
 */
export function parseMentionsWithPositions(
  text: string,
  options?: MentionParseOptions,
): MentionParseResult {
  const seen = new Set<string>();
  const names: string[] = [];
  const positions: MentionParseResult['positions'] = [];
  const excludedNames = buildExcludedMentionNameSet(options);

  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    if (excludedNames.has(name.toLowerCase())) {
      continue;
    }
    positions.push({ name, start: match.index, end: match.index + match[0].length });
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return { names, positions };
}
