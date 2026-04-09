import assert from 'node:assert/strict';
import test from 'node:test';

import { readProductChatViewSource } from './helpers/readProductChatViewSource.js';

test('ChatView renders inline structured choices with transcript-backed responses', async () => {
  const source = await readProductChatViewSource('chat');

  assert.match(source, /MessageChoices/u);
  assert.match(source, /choiceResponsesBySource/u);
  assert.match(source, /onChoiceSubmit/u);
  assert.match(source, /message\.choices/u);
});
