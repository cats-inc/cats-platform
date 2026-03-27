import type { ChatCat } from '../../api/contracts';
import { parseMentionsWithPositions } from '../../state/mentionParsing';

export type MessageBodySegmentKind = 'text' | 'url' | 'mention';

export interface MessageBodySegment {
  kind: MessageBodySegmentKind;
  value: string;
  href?: string;
  avatarColor?: string | null;
}

interface TokenSpan {
  kind: 'url' | 'mention';
  start: number;
  end: number;
  value: string;
  href?: string;
  avatarColor?: string | null;
}

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;
const TRAILING_PUNCT = /[.,;:!?]+$/;

function stripTrailingPunct(url: string): string {
  return url.replace(TRAILING_PUNCT, '');
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function segmentMessageBody(
  body: string,
  cats: ChatCat[],
): MessageBodySegment[] {
  const catLookup = new Map<string, ChatCat>();
  for (const cat of cats) {
    catLookup.set(cat.name.toLowerCase(), cat);
  }

  // Collect URL tokens
  const urlTokens: TokenSpan[] = [];
  const urlRegex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(body)) !== null) {
    const raw = urlMatch[0];
    const cleaned = stripTrailingPunct(raw);
    urlTokens.push({
      kind: 'url',
      start: urlMatch.index,
      end: urlMatch.index + cleaned.length,
      value: cleaned,
      href: cleaned,
    });
  }

  // Collect mention tokens
  const mentionResult = parseMentionsWithPositions(body);
  const mentionTokens: TokenSpan[] = mentionResult.positions.map((pos) => {
    const cat = catLookup.get(pos.name.toLowerCase()) ?? null;
    return {
      kind: 'mention' as const,
      start: pos.start,
      end: pos.end,
      value: body.slice(pos.start, pos.end),
      avatarColor: cat?.avatarColor ?? null,
    };
  });

  // Merge and filter: URL wins over mention on overlap
  const filtered = mentionTokens.filter(
    (mention) =>
      !urlTokens.some((url) =>
        rangesOverlap(mention.start, mention.end, url.start, url.end),
      ),
  );
  const tokens: TokenSpan[] = [...urlTokens, ...filtered].sort(
    (a, b) => a.start - b.start,
  );

  // Walk and emit segments
  const segments: MessageBodySegment[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (token.start > cursor) {
      segments.push({ kind: 'text', value: body.slice(cursor, token.start) });
    }
    if (token.kind === 'url') {
      segments.push({ kind: 'url', value: token.value, href: token.href });
    } else {
      segments.push({
        kind: 'mention',
        value: token.value,
        avatarColor: token.avatarColor,
      });
    }
    cursor = token.end;
  }

  if (cursor < body.length) {
    segments.push({ kind: 'text', value: body.slice(cursor) });
  }

  return segments;
}
