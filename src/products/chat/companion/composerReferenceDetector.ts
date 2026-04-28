import {
  COMPANION_REFERENCE_HOST,
  COMPANION_REFERENCE_SCHEME,
  parseCompanionContentReference,
  type CompanionContentReference,
  type CompanionReferenceParseResult,
} from './contentReference.js';

/**
 * SPEC-086 / PLAN-077 Phase 4 composer paste detection.
 *
 * The composer scans pasted / typed text for `cats://companion/...`
 * occurrences, lets each one parse through `parseCompanionContentReference`,
 * and surfaces parsed/unsupported/invalid hits as offsets so the renderer
 * can render the matching preview chip OR the "unsupported version" /
 * "malformed" fallback chip in-place.
 */

export interface CompanionReferenceMatch {
  /** Inclusive start index in the original text. */
  start: number;
  /** Exclusive end index in the original text. */
  end: number;
  /** The exact substring at `[start, end)`. */
  rawText: string;
  parseResult: CompanionReferenceParseResult;
}

const SCHEME_HOST_LITERAL = `${COMPANION_REFERENCE_SCHEME}//${COMPANION_REFERENCE_HOST}/`;

const TERMINATOR_PATTERN = /[\s<>'"　]/u;

export function detectCompanionReferences(text: string): CompanionReferenceMatch[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const matches: CompanionReferenceMatch[] = [];
  const lowered = text.toLowerCase();
  const literal = SCHEME_HOST_LITERAL.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const found = lowered.indexOf(literal, cursor);
    if (found === -1) {
      break;
    }
    const end = findReferenceEnd(text, found);
    const rawText = text.slice(found, end);
    const parseResult = parseCompanionContentReference(rawText);
    matches.push({ start: found, end, rawText, parseResult });
    cursor = end;
  }
  return matches;
}

export function extractParsedCompanionReferences(
  text: string,
): CompanionContentReference[] {
  const out: CompanionContentReference[] = [];
  for (const match of detectCompanionReferences(text)) {
    if (match.parseResult.status === 'parsed') {
      out.push(match.parseResult.reference);
    }
  }
  return out;
}

function findReferenceEnd(text: string, start: number): number {
  for (let i = start; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (TERMINATOR_PATTERN.test(ch)) {
      return i;
    }
  }
  return text.length;
}

/**
 * Replace each detected `cats://companion/...` occurrence in `text` with
 * a renderer-friendly placeholder produced by `format`. Useful for the
 * composer preview where the reference becomes a chip and the underlying
 * substring is hidden / replaced with a token.
 */
export function replaceCompanionReferences(
  text: string,
  format: (match: CompanionReferenceMatch) => string,
): string {
  const matches = detectCompanionReferences(text);
  if (matches.length === 0) {
    return text;
  }
  let out = '';
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      out += text.slice(cursor, match.start);
    }
    out += format(match);
    cursor = match.end;
  }
  if (cursor < text.length) {
    out += text.slice(cursor);
  }
  return out;
}
