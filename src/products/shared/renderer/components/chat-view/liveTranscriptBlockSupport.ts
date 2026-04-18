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
  _lastBlock: LiveIndicatorContentBlock | null | undefined,
): boolean {
  // As long as the segment is streaming, surface trailing dots unconditionally.
  // Earlier revisions tried to suppress dots when a text block was in
  // "streaming" status (on the theory that the animated text itself was
  // enough of an activity signal) or only for non-text streaming blocks.
  // The live trace showed CLI-backed runtimes hold a text block at
  // status=streaming for tens of seconds after emitting its entire content,
  // producing a static sentence with no dots for the long gap between the
  // text and the next tool_use / segment. Always showing dots for streaming
  // segments matches user expectation ("dots = still working") without
  // clashing with live text, which visually grows above the dots instead of
  // competing with them.
  return phase === 'streaming';
}
