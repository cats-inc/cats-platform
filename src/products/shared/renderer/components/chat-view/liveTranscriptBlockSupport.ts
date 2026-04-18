import type { LiveIndicatorContentBlock } from '../../../../../shared/runtimeContentBlocks.js';

const LEADING_BLANK_LINES_PATTERN = /^(?:[ \t]*\r?\n)+/u;

export function stripLeadingLiveTranscriptBlankLines(value: string): string {
  return value.replace(LEADING_BLANK_LINES_PATTERN, '');
}

export function shouldRenderCollapsedLiveTranscriptBlock(
  block: LiveIndicatorContentBlock,
): boolean {
  if (block.status === 'error') {
    return block.kind !== 'status' || block.text.trim().length > 0;
  }

  return false;
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
  phase: 'idle' | 'waiting' | 'streaming' | 'sealed',
  lastBlock: LiveIndicatorContentBlock | null | undefined,
): boolean {
  if (phase !== 'streaming') {
    return false;
  }
  // Actively streaming text already communicates "more coming" through the
  // animated text itself, so we suppress trailing dots in that case to avoid
  // a redundant indicator tacked onto the end of the current chunk.
  if (lastBlock?.kind === 'text' && lastBlock.status === 'streaming') {
    return false;
  }
  // Any other streaming-phase state (no block yet, a streaming tool chip,
  // or - critically - a completed text block waiting for the runtime to emit
  // the next segment) should surface trailing dots so the bubble does not go
  // silent between tokens.
  return true;
}
