import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('chat footer sentinel does not add a stray pixel at scroll end', async () => {
  const chatThreadStyles = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-thread.css', import.meta.url),
    'utf8',
  );
  const sharedThreadStyles = await readFile(
    new URL('../src/products/shared/renderer/styles/chat-thread.css', import.meta.url),
    'utf8',
  );
  const autoScrollHook = await readFile(
    new URL('../src/products/shared/renderer/hooks/useTranscriptAutoScroll.ts', import.meta.url),
    'utf8',
  );

  const sentinelRule = chatThreadStyles.match(/\.transcriptBottomSentinel\s*\{[^}]+\}/u)?.[0] ?? '';
  const sharedSentinelRule = sharedThreadStyles.match(
    /\.transcriptBottomSentinel\s*\{[^}]+\}/u,
  )?.[0] ?? '';

  assert.match(sentinelRule, /height:\s*0/u);
  assert.match(sentinelRule, /margin-top:\s*-18px/u);
  assert.match(sharedSentinelRule, /height:\s*0/u);
  assert.match(sharedSentinelRule, /margin-top:\s*-18px/u);
  assert.match(autoScrollHook, /Math\.max\(0,\s*nextComposerFlowOffset\)/u);
  assert.doesNotMatch(autoScrollHook, /Math\.max\(1,\s*nextComposerFlowOffset \+ 1\)/u);
});

test('parallel composer offset matches the footer stack height', async () => {
  const chatThreadStyles = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-thread.css', import.meta.url),
    'utf8',
  );
  const chatShellStyles = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-shell.css', import.meta.url),
    'utf8',
  );
  const sidebarChromeStyles = await readFile(
    new URL('../src/design/components/sidebar-chrome.css', import.meta.url),
    'utf8',
  );

  const parallelComposerRule = chatThreadStyles.match(
    /\.composerCardDocked\.composerCardDockedParallel\s*\{[^}]+\}/u,
  )?.[0] ?? '';
  const parallelFooterRule = chatThreadStyles.match(/\.parallelFooterBar\s*\{[^}]+\}/u)?.[0] ?? '';
  const sidebarFooterRule = chatShellStyles.match(
    /\.sidebarFooter\s*\{\s*position:\s*relative;[^}]+\}/u,
  )?.[0] ?? '';
  const sidebarFooterButtonRule = sidebarChromeStyles.match(
    /\.sidebarFooterButton\s*\{[^}]+\}/u,
  )?.[0] ?? '';

  assert.match(parallelComposerRule, /bottom:\s*78px/u);
  assert.match(parallelFooterRule, /height:\s*60px/u);
  assert.match(parallelFooterRule, /padding:\s*0 28px/u);
  assert.match(sidebarFooterRule, /height:\s*60px/u);
  assert.match(sidebarFooterButtonRule, /height:\s*100%/u);
});
