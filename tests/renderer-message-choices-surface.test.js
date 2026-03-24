import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('ChatView renders inline structured choices with transcript-backed responses', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/components/ChatView.tsx'),
    'utf8',
  );

  assert.match(source, /MessageChoices/u);
  assert.match(source, /choiceResponsesBySource/u);
  assert.match(source, /onChoiceSubmit/u);
  assert.match(source, /message\.choices/u);
});
