import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('chat footer sentinel does not add a stray pixel at scroll end', async () => {
  const chatThreadStyles = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-thread.css', import.meta.url),
    'utf8',
  );
  const autoScrollHook = await readFile(
    new URL('../src/products/shared/renderer/hooks/useTranscriptAutoScroll.ts', import.meta.url),
    'utf8',
  );

  const sentinelRule = chatThreadStyles.match(/\.transcriptBottomSentinel\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(sentinelRule, /height:\s*0/u);
  assert.match(sentinelRule, /margin-top:\s*-18px/u);
  assert.match(autoScrollHook, /Math\.max\(0,\s*nextComposerFlowOffset\)/u);
  assert.doesNotMatch(autoScrollHook, /Math\.max\(1,\s*nextComposerFlowOffset \+ 1\)/u);
});

test('parallel composer offset matches the footer stack height', async () => {
  const chatThreadStyles = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-thread.css', import.meta.url),
    'utf8',
  );

  const parallelComposerRule = chatThreadStyles.match(
    /\.composerCardDocked\.composerCardDockedParallel\s*\{[^}]+\}/u,
  )?.[0] ?? '';

  assert.match(parallelComposerRule, /bottom:\s*79px/u);
});
