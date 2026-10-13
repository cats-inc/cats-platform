import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DESKTOP_MAIN_WINDOW_MIN_SIZE } from '../build/desktop/windowPlacement.js';
import { readStylesheetSync } from './helpers/readStylesheet.js';

const STYLES_DIR = new URL('../src/products/shared/renderer/styles/', import.meta.url);
// Width the Desktop window frame and a classic (non-overlay) scrollbar take
// from the window before the canvas content box; macOS can take neither.
const WINDOW_FRAME_ALLOWANCE = 16;
const SCROLLBAR_ALLOWANCE = 17;
const SHELL_STACK_MEDIA = '@media (max-width: 768px)';
const TOP_BAR_STACK_CONTAINER = '@container canvas (max-width: 720px)';
const CANVAS_COMPACT_CONTAINER = '@container canvas (max-width: 600px)';

function readStyles(name) {
  return readStylesheetSync(new URL(name, STYLES_DIR));
}

function atRuleBodies(stylesheet, prelude) {
  const bodies = [];
  let from = stylesheet.indexOf(`${prelude} {`);
  while (from !== -1) {
    const open = stylesheet.indexOf('{', from);
    let depth = 0;
    let index = open;
    for (; index < stylesheet.length; index += 1) {
      if (stylesheet[index] === '{') depth += 1;
      if (stylesheet[index] === '}' && --depth === 0) break;
    }
    bodies.push(stylesheet.slice(open + 1, index));
    from = stylesheet.indexOf(`${prelude} {`, index);
  }
  return bodies;
}

function pixels(prelude) {
  return Number(prelude.match(/(\d+)px/u)[1]);
}

test('the chat shell keeps its sidebar at the Desktop minimum window and stacks only at phone widths', () => {
  assert.ok(pixels(SHELL_STACK_MEDIA) < DESKTOP_MAIN_WINDOW_MIN_SIZE.width - WINDOW_FRAME_ALLOWANCE);

  for (const name of ['chat-composer-base.css', 'settings.css']) {
    const stylesheet = readStyles(name);
    assert.doesNotMatch(stylesheet, /max-width:\s*980px/u, name);
    const [stackBody = ''] = atRuleBodies(stylesheet, SHELL_STACK_MEDIA);
    assert.match(stackBody, /\.claudeShell[^{]*\{\s*grid-template-columns:\s*1fr;/u, name);
  }
});

test('canvas content adapts to the canvas column rather than the viewport', () => {
  const shell = readStyles('chat-shell-base.css');
  const canvasRule = shell.match(/\n\.claudeShell > \.canvas\s*\{[^}]+\}/u)?.[0] ?? '';
  assert.match(canvasRule, /container:\s*canvas \/ inline-size;/u);

  const expected = {
    'chat-composer-base.css': [/\.transcriptMessage\s*\{/u, /\.composerCard\s*\{/u],
    'settings.css': [/\.catsLayout\s*\{\s*grid-template-columns:\s*1fr;/u],
    'chat-thread.css': [/\.parallelFooterBar\s*\{/u, /\.compareCardsGrid\s*\{\s*grid-template-columns:\s*1fr;/u],
    'chat-thread-base.css': [/\.draftHeaderProfile\s*\{\s*grid-template-columns:\s*1fr;/u],
  };
  for (const [name, patterns] of Object.entries(expected)) {
    const stylesheet = readStyles(name);
    assert.doesNotMatch(stylesheet, /@media \(max-width:\s*720px\)/u, name);
    const compactRules = atRuleBodies(stylesheet, CANVAS_COMPACT_CONTAINER).join('\n');
    for (const pattern of patterns) assert.match(compactRules, pattern, name);
  }
});

test('the canvas top bar sizes from the canvas and stacks its slots on narrow canvases', () => {
  const base = readStyles('chat-thread-base.css');
  const centerRule = base.match(/\n\.channelTopBarCenter\s*\{[^}]+\}/u)?.[0] ?? '';
  assert.match(centerRule, /width:\s*min\([^;]*100cqw[^;]*\);/u);
  assert.doesNotMatch(centerRule, /\d+vw/u);
  // Read without inlining @import: chat-thread.css must not re-declare the base rule.
  const thread = readFileSync(new URL('chat-thread.css', STYLES_DIR), 'utf8');
  assert.doesNotMatch(thread, /\.channelTopBarCenter\s*\{/u);

  const stackRules = atRuleBodies(readStyles('chat-composer-base.css'), TOP_BAR_STACK_CONTAINER).join('\n');
  assert.match(stackRules, /\.channelTopBar\s*\{\s*grid-template-columns:\s*1fr;/u);
  assert.match(stackRules, /\.channelTopBarCenter\s*\{\s*width:\s*100%;/u);
});

test('at the Desktop minimum window top bars stack while the transcript and composer stay wide', () => {
  const shell = readStyles('chat-shell-base.css');
  const sidebarWidth = Number(
    shell.match(/\n\.claudeShell\s*\{[^}]*grid-template-columns:\s*(\d+)px/u)?.[1],
  );
  const canvasGutter = Number(
    shell.match(/\n\.claudeShell > \.canvas\s*\{[^}]*padding:\s*0 (\d+)px;/u)?.[1],
  );
  const widestContent = DESKTOP_MAIN_WINDOW_MIN_SIZE.width - sidebarWidth - canvasGutter * 2;
  const narrowestContent = widestContent - WINDOW_FRAME_ALLOWANCE - SCROLLBAR_ALLOWANCE;

  assert.ok(
    narrowestContent > pixels(CANVAS_COMPACT_CONTAINER),
    `canvas content ${narrowestContent}px must exceed ${CANVAS_COMPACT_CONTAINER}`,
  );
  assert.ok(
    widestContent <= pixels(TOP_BAR_STACK_CONTAINER),
    `canvas content ${widestContent}px must stay within ${TOP_BAR_STACK_CONTAINER}`,
  );
});
