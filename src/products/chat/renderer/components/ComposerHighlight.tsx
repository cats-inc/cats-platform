import { useMemo, type CSSProperties } from 'react';
import type { ChatCat } from '../../api/contracts';
import { parseMentionsWithPositions } from '../../state/mentionParsing';
import {
  detectCompanionReferences,
  type CompanionReferenceMatch,
} from '../../companion/composerReferenceDetector';

export interface ComposerHighlightProps {
  text: string;
  cats: ChatCat[];
  excludedMentionNames?: string[];
}

export const COMPOSER_HIGHLIGHT_ROOT_CLASS_NAME =
  'composerInput composerHighlight';

export interface ComposerHighlightFragment {
  kind: 'text' | 'mention' | 'reference';
  value: string;
  avatarColor?: string | null;
  /**
   * For `kind: 'reference'`, the parse status drives the chip variant:
   * `parsed` shows the live preview chip in the renderer host; the other
   * statuses show the inline "Unsupported version" / "Malformed" fallback
   * chip per SPEC-086.
   */
  referenceStatus?: 'parsed' | 'unsupported_version' | 'invalid';
  referenceVersion?: string;
  referenceInvalidReason?: string;
}

interface RangedFragment {
  start: number;
  end: number;
  fragment: Omit<ComposerHighlightFragment, 'value'>;
}

export function buildComposerHighlightFragments(
  text: string,
  cats: ChatCat[],
  excludedMentionNames: string[] = [],
): ComposerHighlightFragment[] {
  const catLookup = new Map(
    cats.map((cat) => [cat.name.toLowerCase(), cat] as const),
  );
  const mentionResult = parseMentionsWithPositions(text, {
    excludedNames: excludedMentionNames,
  });
  const confirmedMentions: RangedFragment[] = mentionResult.positions
    .flatMap((pos) => {
      const cat = catLookup.get(pos.name.toLowerCase());
      if (!cat) return [];
      return [{
        start: pos.start,
        end: pos.end,
        fragment: {
          kind: 'mention' as const,
          avatarColor: cat.avatarColor ?? null,
        },
      }];
    });

  const referenceMatches = detectCompanionReferences(text);
  const referenceFragments: RangedFragment[] = referenceMatches.map(
    (match: CompanionReferenceMatch) => ({
      start: match.start,
      end: match.end,
      fragment: {
        kind: 'reference' as const,
        referenceStatus:
          match.parseResult.status === 'parsed'
            ? 'parsed'
            : match.parseResult.status === 'unsupported_version'
              ? 'unsupported_version'
              : 'invalid',
        referenceVersion:
          match.parseResult.status === 'unsupported_version'
            ? match.parseResult.version
            : undefined,
        referenceInvalidReason:
          match.parseResult.status === 'invalid'
            ? match.parseResult.reason
            : undefined,
      },
    }),
  );

  const ranges = [...confirmedMentions, ...referenceFragments]
    .sort((left, right) => left.start - right.start);
  if (ranges.length === 0) {
    return [{ kind: 'text', value: text }];
  }

  const parts: ComposerHighlightFragment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) {
      // Overlapping ranges (shouldn't happen with current detectors) — skip
      // the later range so we never emit malformed nested fragments.
      continue;
    }
    if (range.start > cursor) {
      parts.push({ kind: 'text', value: text.slice(cursor, range.start) });
    }
    parts.push({
      ...range.fragment,
      value: text.slice(range.start, range.end),
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push({ kind: 'text', value: text.slice(cursor) });
  }
  return parts;
}

function buildComposerMentionStyle(
  avatarColor: string | null | undefined,
): CSSProperties | undefined {
  if (!avatarColor) {
    return undefined;
  }
  return {
    background: avatarColor,
    boxShadow: `0 0 0 0.16em ${avatarColor}`,
  };
}

export function ComposerHighlight({
  text,
  cats,
  excludedMentionNames = [],
}: ComposerHighlightProps) {
  const fragments = useMemo(
    () => buildComposerHighlightFragments(text, cats, excludedMentionNames),
    [excludedMentionNames, text, cats],
  );

  return (
    <div className={COMPOSER_HIGHLIGHT_ROOT_CLASS_NAME} aria-hidden="true">
      {fragments.map((frag, i) => {
        if (frag.kind === 'mention') {
          return (
            <span
              key={i}
              className="composerHighlightMention"
              style={buildComposerMentionStyle(frag.avatarColor)}
            >
              {frag.value}
            </span>
          );
        }
        if (frag.kind === 'reference') {
          return (
            <span
              key={i}
              className={
                frag.referenceStatus === 'parsed'
                  ? 'composerHighlightReference composerHighlightReferenceParsed'
                  : frag.referenceStatus === 'unsupported_version'
                    ? 'composerHighlightReference composerHighlightReferenceUnsupportedVersion'
                    : 'composerHighlightReference composerHighlightReferenceInvalid'
              }
              data-reference-status={frag.referenceStatus}
            >
              {frag.value}
            </span>
          );
        }
        return <span key={i}>{frag.value}</span>;
      })}
      {/* trailing space ensures mirror matches textarea height when last char is newline */}
      {'\u00A0'}
    </div>
  );
}
