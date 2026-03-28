import { useMemo } from 'react';
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
}

export function buildComposerHighlightFragments(
  text: string,
  cats: ChatCat[],
): ComposerHighlightFragment[] {
  const catNames = new Set(cats.map((c) => c.name.toLowerCase()));
  const result = parseMentionsWithPositions(text);
  const confirmed = result.positions.filter((pos) =>
    catNames.has(pos.name.toLowerCase()));

  if (confirmed.length === 0) {
    return [{ kind: 'text', value: text }];
  }

  const parts: ComposerHighlightFragment[] = [];
  let cursor = 0;
  for (const pos of confirmed) {
    if (pos.start > cursor) {
      parts.push({ kind: 'text', value: text.slice(cursor, pos.start) });
    }
    parts.push({ kind: 'mention', value: text.slice(pos.start, pos.end) });
    cursor = pos.end;
  }
  if (cursor < text.length) {
    parts.push({ kind: 'text', value: text.slice(cursor) });
  }
  return parts;
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
          <span key={i} className="composerHighlightMention">{frag.value}</span>
        ) : (
          <span key={i}>{frag.value}</span>
        ),
      )}
      {/* trailing space ensures mirror matches textarea height when last char is newline */}
      {'\u00A0'}
    </div>
  );
}
