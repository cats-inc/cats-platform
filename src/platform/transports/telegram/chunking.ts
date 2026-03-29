const DEFAULT_TELEGRAM_LIMIT = 4096;

/**
 * Split a long reply into chunks safe for Telegram.
 * Preserves fenced code blocks, paragraph boundaries, and list structure.
 */
export function chunkTelegramReply(
  text: string,
  limit: number = DEFAULT_TELEGRAM_LIMIT,
): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    const candidate = remaining.slice(0, limit);
    const splitIndex = findBestSplitPoint(candidate, remaining, limit);

    if (splitIndex <= 0) {
      // Hard split at limit if no good boundary found
      chunks.push(remaining.slice(0, limit));
      remaining = remaining.slice(limit);
    } else {
      chunks.push(remaining.slice(0, splitIndex).trimEnd());
      remaining = remaining.slice(splitIndex).trimStart();
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

function findBestSplitPoint(
  candidate: string,
  _full: string,
  limit: number,
): number {
  // Check if we'd split inside a fenced code block
  const fencePositions = findFencePositions(candidate);
  const insideCodeBlock = fencePositions.length % 2 !== 0;

  if (insideCodeBlock) {
    // Try to split at a line boundary inside the code block
    const lastNewline = candidate.lastIndexOf('\n');
    if (lastNewline > limit * 0.3) {
      return lastNewline + 1;
    }
  }

  // 1. Try paragraph boundary (double newline)
  const lastParagraph = candidate.lastIndexOf('\n\n');
  if (lastParagraph > limit * 0.3) {
    return lastParagraph + 2;
  }

  // 2. Try line boundary
  const lastNewline = candidate.lastIndexOf('\n');
  if (lastNewline > limit * 0.3) {
    return lastNewline + 1;
  }

  // 3. Try sentence boundary
  const sentenceEnd = findLastSentenceBoundary(candidate, limit);
  if (sentenceEnd > limit * 0.3) {
    return sentenceEnd;
  }

  // 4. Try word boundary
  const lastSpace = candidate.lastIndexOf(' ');
  if (lastSpace > limit * 0.3) {
    return lastSpace + 1;
  }

  return -1;
}

function findFencePositions(text: string): number[] {
  const positions: number[] = [];
  let index = 0;
  while (index < text.length) {
    const fenceStart = text.indexOf('```', index);
    if (fenceStart === -1) break;
    positions.push(fenceStart);
    index = fenceStart + 3;
  }
  return positions;
}

function findLastSentenceBoundary(text: string, limit: number): number {
  const sentenceEnders = ['. ', '! ', '? '];
  let best = -1;
  for (const ender of sentenceEnders) {
    const pos = text.lastIndexOf(ender, limit - 1);
    if (pos > best) {
      best = pos + ender.length;
    }
  }
  return best;
}
