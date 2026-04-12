import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';

function stripLeadingBlankLines(value: string): string {
  return value.replace(/^(?:[ \t]*\r?\n)+/u, '');
}

export function resolveLiveIndicatorPreviewBody(
  liveIndicator: LiveIndicatorState,
): string {
  const previewText = liveIndicator.previewText ?? '';
  if (previewText.trim().length > 0) {
    return stripLeadingBlankLines(previewText);
  }

  return stripLeadingBlankLines(liveIndicator.contentBlocks
    .filter((block) => block.kind === 'text' && block.text.trim().length > 0)
    .sort((left, right) => left.index - right.index)
    .map((block) => block.text)
    .join(''));
}
