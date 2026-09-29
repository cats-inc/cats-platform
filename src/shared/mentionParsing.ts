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
  /**
   * Names the caller can resolve, such as the room's Cats and orchestrator.
   * A known name may contain spaces. At each `@`, the longest known name that
   * matches wins; otherwise the mention is the single token after the `@`.
   */
  knownNames?: Iterable<string>;
}

const MENTION_ANCHOR = /(?<!\w)@/gu;
const MENTION_TOKEN = /^[\p{L}\p{N}._-]+/u;
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;
// CJK text has no spaces between words, so a known name may be followed
// directly by the rest of the sentence.
const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function normalizeNameSet(names: Iterable<string> | undefined): Set<string> {
  return new Set(
    Array.from(names ?? [])
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
}

function characterAt(text: string, index: number): string | undefined {
  const codePoint = text.codePointAt(index);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

function endsName(text: string, end: number): boolean {
  const next = characterAt(text, end);
  if (next === undefined || CJK_CHARACTER.test(next)) {
    return true;
  }
  if (WORD_CHARACTER.test(next)) {
    return false;
  }
  if (next === '.' || next === '-') {
    const following = characterAt(text, end + 1);
    return following === undefined || !WORD_CHARACTER.test(following);
  }
  return true;
}

function matchKnownName(text: string, start: number, knownNames: readonly string[]): string | null {
  for (const knownName of knownNames) {
    const candidate = text.slice(start, start + knownName.length);
    if (candidate.toLowerCase() === knownName && endsName(text, start + knownName.length)) {
      return candidate;
    }
  }
  return null;
}

function scanMentions(
  text: string,
  options: MentionParseOptions | undefined,
): MentionParseResult['positions'] {
  const excludedNames = normalizeNameSet(options?.excludedNames);
  const knownNames = [...normalizeNameSet(options?.knownNames)]
    .sort((left, right) => right.length - left.length);
  const positions: MentionParseResult['positions'] = [];
  const anchor = new RegExp(MENTION_ANCHOR.source, MENTION_ANCHOR.flags);
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(text)) !== null) {
    const nameStart = match.index + 1;
    const name = matchKnownName(text, nameStart, knownNames)
      ?? MENTION_TOKEN.exec(text.slice(nameStart))?.[0];
    if (!name) {
      continue;
    }
    const end = nameStart + name.length;
    anchor.lastIndex = end;
    if (excludedNames.has(name.toLowerCase())) {
      continue;
    }
    positions.push({ name, start: match.index, end });
  }
  return positions;
}

/**
 * Parse @mentions from text, returning unique names (without @).
 * Case-preserving — comparison should be case-insensitive at the routing layer.
 */
export function parseMentions(
  text: string,
  options?: MentionParseOptions,
): string[] {
  return Array.from(new Set(scanMentions(text, options).map((position) => position.name)));
}

/**
 * Parse @mentions with position information for richer downstream use.
 */
export function parseMentionsWithPositions(
  text: string,
  options?: MentionParseOptions,
): MentionParseResult {
  const positions = scanMentions(text, options);
  return {
    names: Array.from(new Set(positions.map((position) => position.name))),
    positions,
  };
}
