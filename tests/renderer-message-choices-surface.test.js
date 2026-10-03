import assert from 'node:assert/strict';
import test from 'node:test';

import { readProductConversationViewSource } from './helpers/readProductConversationViewSource.js';

test('ConversationView renders inline structured choices with transcript-backed responses', async () => {
  const source = await readProductConversationViewSource('chat');

  assert.match(source, /MessageChoices/u);
  assert.match(source, /choiceResponsesBySource/u);
  assert.match(source, /onChoiceSubmit/u);
  assert.match(source, /message\.choices/u);
});
