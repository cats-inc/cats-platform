import { useMemo, type CSSProperties } from 'react';
import type { ChatCat } from '../../api/contracts';
import { parseMentionsWithPositions } from '../../state/mentionParsing';

export interface ComposerHighlightProps {
  text: string;
  cats: ChatCat[];
}

export const COMPOSER_HIGHLIGHT_ROOT_CLASS_NAME =
  'composerInput composerHighlight';

export interface ComposerHighlightFragment {
  kind: 'text' | 'mention';
  value: string;
  avatarColor?: string | null;
}

export function buildComposerHighlightFragments(
  text: string,
  cats: ChatCat[],
): ComposerHighlightFragment[] {
  const catLookup = new Map(
    cats.map((cat) => [cat.name.toLowerCase(), cat] as const),
  );
  const result = parseMentionsWithPositions(text);
  const confirmed = result.positions.flatMap((pos) => {
    const cat = catLookup.get(pos.name.toLowerCase());
    if (!cat) {
      return [];
    }
    return [{
      ...pos,
      avatarColor: cat.avatarColor ?? null,
    }];
  });

  if (confirmed.length === 0) {
    return [{ kind: 'text', value: text }];
  }

  const parts: ComposerHighlightFragment[] = [];
  let cursor = 0;
  for (const pos of confirmed) {
    if (pos.start > cursor) {
      parts.push({ kind: 'text', value: text.slice(cursor, pos.start) });
    }
    parts.push({
      kind: 'mention',
      value: text.slice(pos.start, pos.end),
      avatarColor: pos.avatarColor,
    });
    cursor = pos.end;
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

export function ComposerHighlight({ text, cats }: ComposerHighlightProps) {
  const fragments = useMemo(
    () => buildComposerHighlightFragments(text, cats),
    [text, cats],
  );

  return (
    <div className={COMPOSER_HIGHLIGHT_ROOT_CLASS_NAME} aria-hidden="true">
      {fragments.map((frag, i) =>
        frag.kind === 'mention' ? (
          <span
            key={i}
            className="composerHighlightMention"
            style={buildComposerMentionStyle(frag.avatarColor)}
          >
            {frag.value}
          </span>
        ) : (
          <span key={i}>{frag.value}</span>
        ),
      )}
      {/* trailing space ensures mirror matches textarea height when last char is newline */}
      {'\u00A0'}
    </div>
  );
}
