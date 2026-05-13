import { parseMentionsWithPositions } from '../../../../shared/mentionParsing.js';

/**
 * Minimum cat shape the segmenter needs in order to render mentions.
 * Both the full `ChatCat` (`workspaceContracts.ts`) and any leaner
 * mobile-safe cat reference satisfy this structurally — keeping the
 * dependency surface narrow lets the mobile-safe boundary
 * (`src/mobile/`) re-export the segmenter without dragging the whole
 * `workspaceContracts` module (which transitively pulls Node-only
 * imports through `guideCatAssist`).
 */
export interface MentionResolverCat {
  name: string;
  avatarColor?: string | null;
}

export interface MessageBodyAttachment {
  filename: string;
  relativePath: string;
  isImage: boolean;
}

const INLINE_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
]);

const ATTACHMENT_BLOCK_REGEX =
  /^\[Attached files in working directory:\]\n((?:- [^\n]+\n)+)\n?/;

export function extractAttachments(body: string): {
  attachments: MessageBodyAttachment[];
  textBody: string;
} {
  const match = ATTACHMENT_BLOCK_REGEX.exec(body);
  if (!match) {
    return { attachments: [], textBody: body };
  }

  const block = match[1];
  const attachments: MessageBodyAttachment[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.replace(/^- /, '').trim();
    if (!trimmed) continue;
    const ext = trimmed.slice(trimmed.lastIndexOf('.')).toLowerCase();
    const filename = trimmed.split('/').pop() ?? trimmed;
    attachments.push({
      filename,
      relativePath: trimmed,
      isImage: INLINE_IMAGE_EXTENSIONS.has(ext),
    });
  }

  const textBody = body.slice(match[0].length);
  return { attachments, textBody };
}

export type MessageBodySegmentKind = 'text' | 'url' | 'route' | 'mention';

export interface MessageBodySegment {
  kind: MessageBodySegmentKind;
  value: string;
  href?: string;
  avatarColor?: string | null;
}

interface TokenSpan {
  kind: 'url' | 'route' | 'mention';
  start: number;
  end: number;
  value: string;
  href?: string;
  avatarColor?: string | null;
}

const URL_REGEX = /https?:\/\/[^\s<>"'\]]+/gi;
const INTERNAL_ROUTE_REGEX = /\/(?:work|chat|code)\/[^\s<>"'\]]+/g;
const TRAILING_TRIM_CHARS = new Set(['.', ',', ';']);

function hasUnmatchedTrailingParen(value: string): boolean {
  let balance = 0;
  for (const char of value) {
    if (char === '(') {
      balance += 1;
    } else if (char === ')') {
      balance -= 1;
    }
  }
  return balance < 0;
}

function normalizeMatchedUrl(rawUrl: string): string {
  let candidate = rawUrl;
  while (candidate.length > 0) {
    const trailing = candidate.at(-1);
    if (!trailing) {
      break;
    }
    if (TRAILING_TRIM_CHARS.has(trailing)) {
      candidate = candidate.slice(0, -1);
      continue;
    }
    if (trailing === ')' && hasUnmatchedTrailingParen(candidate)) {
      candidate = candidate.slice(0, -1);
      continue;
    }
    break;
  }
  return candidate;
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
  cats: MentionResolverCat[],
  disabledMentionNames: string[] = [],
): MessageBodySegment[] {
  const catLookup = new Map<string, MentionResolverCat>();
  for (const cat of cats) {
    catLookup.set(cat.name.toLowerCase(), cat);
  }

  const urlTokens: TokenSpan[] = [];
  const urlRegex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(body)) !== null) {
    const raw = urlMatch[0];
    const cleaned = normalizeMatchedUrl(raw);
    urlTokens.push({
      kind: 'url',
      start: urlMatch.index,
      end: urlMatch.index + cleaned.length,
      value: cleaned,
      href: cleaned,
    });
  }

  const routeTokens: TokenSpan[] = [];
  const routeRegex = new RegExp(INTERNAL_ROUTE_REGEX.source, INTERNAL_ROUTE_REGEX.flags);
  let routeMatch: RegExpExecArray | null;
  while ((routeMatch = routeRegex.exec(body)) !== null) {
    const raw = routeMatch[0];
    const cleaned = normalizeMatchedUrl(raw);
    routeTokens.push({
      kind: 'route',
      start: routeMatch.index,
      end: routeMatch.index + cleaned.length,
      value: cleaned,
      href: cleaned,
    });
  }

  const mentionResult = parseMentionsWithPositions(body, {
    excludedNames: disabledMentionNames,
  });
  const mentionTokens: TokenSpan[] = mentionResult.positions.flatMap((pos) => {
    const cat = catLookup.get(pos.name.toLowerCase()) ?? null;
    if (!cat) {
      return [];
    }
    return [{
      kind: 'mention' as const,
      start: pos.start,
      end: pos.end,
      value: body.slice(pos.start, pos.end),
      avatarColor: cat.avatarColor ?? null,
    }];
  });

  const filtered = mentionTokens.filter(
    (mention) =>
      !urlTokens.some((url) =>
        rangesOverlap(mention.start, mention.end, url.start, url.end),
      ),
  );
  const filteredRoutes = routeTokens.filter(
    (route) =>
      !urlTokens.some((url) =>
        rangesOverlap(route.start, route.end, url.start, url.end),
      ),
  );
  const tokens: TokenSpan[] = [...urlTokens, ...filteredRoutes, ...filtered].sort(
    (a, b) => a.start - b.start,
  );

  const segments: MessageBodySegment[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (token.start > cursor) {
      segments.push({ kind: 'text', value: body.slice(cursor, token.start) });
    }
    if (token.kind === 'url' || token.kind === 'route') {
      segments.push({ kind: token.kind, value: token.value, href: token.href });
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
