import assert from 'node:assert/strict';
import test from 'node:test';

import type { LiveIndicatorContentBlock } from '../src/shared/runtimeContentBlocks.ts';
import {
  shouldRenderCollapsedLiveTranscriptBlock,
  shouldRenderLiveTranscriptBlock,
  shouldShowLiveTranscriptTrailingDots,
  stripLeadingLiveTranscriptBlankLines,
} from '../src/products/shared/renderer/components/chat-view/liveTranscriptBlockSupport.ts';

function createBlock(
  overrides: Partial<LiveIndicatorContentBlock> = {},
): LiveIndicatorContentBlock {
  return {
    id: 'block-1',
    index: 0,
    kind: 'status',
    status: 'complete',
    title: null,
    text: '',
    toolName: null,
    toolId: null,
    metadata: null,
    ...overrides,
  };
}

test('stripLeadingLiveTranscriptBlankLines removes only the leading blank rows', () => {
  assert.equal(
    stripLeadingLiveTranscriptBlankLines('\n \n\t\nFirst line\n\nSecond line'),
    'First line\n\nSecond line',
  );
  assert.equal(
    stripLeadingLiveTranscriptBlankLines('Already started\n\nSecond line'),
    'Already started\n\nSecond line',
  );
});

test('shouldRenderCollapsedLiveTranscriptBlock only preserves error blocks with meaningful collapsed content', () => {
  assert.equal(
    shouldRenderCollapsedLiveTranscriptBlock(
      createBlock({ kind: 'status', status: 'error', text: '   ' }),
    ),
    false,
  );
  assert.equal(
    shouldRenderCollapsedLiveTranscriptBlock(
      createBlock({ kind: 'status', status: 'error', text: 'Tool crashed' }),
    ),
    true,
  );
  assert.equal(
    shouldRenderCollapsedLiveTranscriptBlock(
      createBlock({ kind: 'tool', status: 'error', text: '' }),
    ),
    true,
  );
  assert.equal(
    shouldRenderCollapsedLiveTranscriptBlock(
      createBlock({ kind: 'tool', status: 'complete', text: 'Finished' }),
    ),
    false,
  );
});

test('shouldRenderLiveTranscriptBlock keeps text, explicit progress details, and collapsed error blocks visible', () => {
  assert.equal(
    shouldRenderLiveTranscriptBlock(createBlock({ kind: 'text', status: 'streaming' }), false),
    true,
  );
  assert.equal(
    shouldRenderLiveTranscriptBlock(createBlock({ kind: 'tool', status: 'complete' }), true),
    true,
  );
  assert.equal(
    shouldRenderLiveTranscriptBlock(
      createBlock({ kind: 'tool', status: 'error', text: '' }),
      false,
    ),
    true,
  );
  assert.equal(
    shouldRenderLiveTranscriptBlock(createBlock({ kind: 'status', status: 'complete' }), false),
    false,
  );
});

test('shouldShowLiveTranscriptTrailingDots only keeps dots on non-text streaming blocks during the streaming phase', () => {
  assert.equal(
    shouldShowLiveTranscriptTrailingDots(
      'streaming',
      createBlock({ kind: 'tool', status: 'streaming' }),
    ),
    true,
  );
  assert.equal(
    shouldShowLiveTranscriptTrailingDots(
      'streaming',
      createBlock({ kind: 'text', status: 'streaming' }),
    ),
    false,
  );
  assert.equal(
    shouldShowLiveTranscriptTrailingDots(
      'sealed',
      createBlock({ kind: 'tool', status: 'streaming' }),
    ),
    false,
  );
  assert.equal(shouldShowLiveTranscriptTrailingDots('streaming', null), false);
});
