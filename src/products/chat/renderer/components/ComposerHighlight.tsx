import { useMemo } from 'react';
import type { ChatCat } from '../../api/contracts';
import { parseMentionsWithPositions } from '../../state/mentionParsing';

export interface ComposerHighlightProps {
  text: string;
  cats: ChatCat[];
}

export function ComposerHighlight({ text, cats }: ComposerHighlightProps) {
  const fragments = useMemo(() => {
    const catNames = new Set(cats.map((c) => c.name.toLowerCase()));
    const result = parseMentionsWithPositions(text);

    // Only highlight mentions that end with a space (confirmed) and match a cat
    const confirmed = result.positions.filter((pos) => {
      const afterEnd = text[pos.end];
      const terminated = afterEnd === ' ' || afterEnd === '\n' || pos.end === text.length;
      return terminated && catNames.has(pos.name.toLowerCase());
    });

    if (confirmed.length === 0) {
      return [{ kind: 'text' as const, value: text }];
    }

    const parts: Array<{ kind: 'text' | 'mention'; value: string }> = [];
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
  }, [text, cats]);

  return (
    <div className="composerHighlight" aria-hidden="true">
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
