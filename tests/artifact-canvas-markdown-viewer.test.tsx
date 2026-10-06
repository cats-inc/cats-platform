import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import type { ArtifactCanvasProjection } from '../src/products/shared/artifactCanvas/contracts.ts';
import { MarkdownViewer } from '../src/products/shared/renderer/viewers/MarkdownViewer.tsx';

const DOCUMENT = [
  '# Release notes',
  '',
  'This paragraph is hard-wrapped',
  'across two lines with **bold** text.',
  '',
  '- first',
  '- second',
  '',
  '```ts',
  'const answer = 42;',
  '```',
  '',
  '<script>alert("owned")</script>',
  '',
  '<img src="x" onerror="alert(1)">',
  '',
  '[click me](javascript:alert(1))',
  '',
  '[docs](https://example.com/docs)',
  '',
  '![remote pixel](https://example.com/pixel.png)',
  '',
  '[conversation](/code/chats/channel-1)',
  '',
  '[sibling](./other.md)',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
].join('\n');

function renderViewer(projection: ArtifactCanvasProjection): string {
  return renderToStaticMarkup(
    <StaticRouter location="/code/chats/channel-1/canvas/artifact-md/view/markdown">
      <MarkdownViewer projection={projection} />
    </StaticRouter>,
  );
}

test('Markdown viewer renders document structure with the chat markdown rules', () => {
  const markup = renderViewer(createProjection({ textContent: DOCUMENT }));

  assert.match(markup, /class="artifactCanvasMarkdown messageBodyMarkdown"/u);
  assert.match(markup, /<h1>Release notes<\/h1>/u);
  assert.match(markup, /<strong>bold<\/strong>/u);
  assert.match(markup, /<ul>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ul>/u);
  assert.match(markup, /<pre><code class="language-ts">const answer = 42;\n<\/code><\/pre>/u);
  assert.match(markup, /<div class="messageBodyTableScroll"><table>/u);
  assert.doesNotMatch(markup, /<br/u, 'documents keep soft line breaks');
});

test('Markdown viewer neutralizes scripts, unsafe links and remote content', () => {
  const markup = renderViewer(createProjection({ textContent: DOCUMENT }));

  assert.doesNotMatch(markup, /<script/iu);
  assert.match(markup, /&lt;script&gt;alert\(&quot;owned&quot;\)&lt;\/script&gt;/u);
  assert.doesNotMatch(markup, /<img/iu, 'neither raw HTML nor remote images load');
  assert.doesNotMatch(markup, /<iframe/iu);
  assert.doesNotMatch(markup, /javascript:/iu);
  assert.match(markup, /<span class="messageBodyInertLink" title="">click me<\/span>/u);
  assert.match(
    markup,
    /<a class="messageBodyLink" href="https:\/\/example\.com\/docs" target="_blank" rel="noopener noreferrer">docs<\/a>/u,
  );
  assert.match(
    markup,
    /<a class="messageBodyLink" href="https:\/\/example\.com\/pixel\.png" target="_blank" rel="noopener noreferrer">remote pixel<\/a>/u,
  );
  assert.match(markup, /<a class="messageBodyLink" href="\/code\/chats\/channel-1"[^>]*>conversation<\/a>/u);
  assert.match(markup, /<span class="messageBodyInertLink" title="\.\/other\.md">sibling<\/span>/u);
});

test('Markdown viewer waits for or reports missing text like the code viewer', () => {
  const loading = renderViewer(createProjection({ safeUrl: 'http://127.0.0.1:47100/README.md' }));
  assert.match(loading, /class="artifactCanvasState"/u);
  assert.doesNotMatch(loading, /artifactCanvasMarkdown/u);

  const unsupported = renderViewer(createProjection({}));
  assert.match(unsupported, /class="artifactCanvasUnsupported"/u);
});

test('Artifact Canvas pane routes the markdown presentation to the Markdown viewer', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/CanvasPane.tsx'),
    'utf8',
  );
  assert.match(
    source,
    /presentationResolved === 'markdown'\) \{\s+return <MarkdownViewer projection=\{projection\}/u,
  );
});

function createProjection(input: {
  safeUrl?: string | null;
  textContent?: string | null;
}): ArtifactCanvasProjection {
  const safeUrl = input.safeUrl ?? null;
  return {
    surface: { kind: 'code_conversation', surfaceId: 'channel-1' },
    artifact: {
      id: 'artifact-md',
      title: 'README.md',
      kind: 'preview',
      status: 'ready',
      summary: null,
      path: safeUrl,
      mimeType: null,
      sizeBytes: null,
      updatedAt: '2026-09-30T00:00:00.000Z',
    },
    presentationRequested: 'markdown',
    presentationResolved: 'markdown',
    iframeSandboxProfile: null,
    safeUrl,
    externalUrl: safeUrl,
    textContent: input.textContent ?? null,
    policyVersion: 'policy-v1',
    error: null,
  };
}
