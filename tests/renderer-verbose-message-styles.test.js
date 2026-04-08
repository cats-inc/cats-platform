import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { readStylesheet } from './helpers/readStylesheet.js';

for (const product of ['chat', 'work', 'code']) {
  test(`${product} transcript system messages render as subtle cards instead of plain centered text`, async () => {
    const source = await readStylesheet(
      path.join(
        process.cwd(),
        'src',
        'products',
        product,
        'renderer',
        'styles',
        'chat-thread.css',
      ),
    );

    assert.match(source, /\.transcriptMessageSystem\s*\{/u);
    assert.match(source, /background:\s*transparent/u);
    assert.match(source, /border:\s*none/u);
    assert.match(source, /box-shadow:\s*none/u);
  });
}
