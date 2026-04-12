import type { LiveIndicatorContentBlock } from '../../../../../shared/runtimeContentBlocks.js';

const LEADING_BLANK_LINES_PATTERN = /^(?:[ \t]*\r?\n)+/u;

export function stripLeadingLiveTranscriptBlankLines(value: string): string {
  return value.replace(LEADING_BLANK_LINES_PATTERN, '');
}

export function shouldRenderCollapsedLiveTranscriptBlock(
  block: LiveIndicatorContentBlock,
): boolean {
  if (block.status === 'error') {
    return true;
  }

  return block.kind === 'status'
    && block.status === 'complete'
    && block.text.trim().length > 0;
}

export function shouldRenderLiveTranscriptBlock(
  block: LiveIndicatorContentBlock,
  showProgressDetails: boolean,
): boolean {
  return block.kind === 'text'
    || showProgressDetails
    || shouldRenderCollapsedLiveTranscriptBlock(block);
}

export function shouldShowLiveTranscriptTrailingDots(
  phase: 'idle' | 'waiting' | 'streaming',
  lastBlock: LiveIndicatorContentBlock | null | undefined,
): boolean {
  return phase === 'streaming'
    && lastBlock != null
    && lastBlock.kind !== 'text'
    && lastBlock.status === 'streaming';
}
