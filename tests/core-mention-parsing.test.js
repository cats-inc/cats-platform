import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseMentions,
  parseMentionsWithPositions,
} from '../dist-server/core/mentionParsing.js';

test('core mention parsing returns unique mention names in encounter order', () => {
  assert.deepEqual(
    parseMentions('Ask @Mochi to pair with @Ghost, then check @Mochi again.'),
    ['Mochi', 'Ghost'],
  );
});

test('core mention parsing preserves mention positions for renderer highlighting', () => {
  assert.deepEqual(
    parseMentionsWithPositions('Ping @Mochi, then @Ghost!'),
    {
      names: ['Mochi', 'Ghost'],
      positions: [
        { name: 'Mochi', start: 5, end: 11 },
        { name: 'Ghost', start: 18, end: 24 },
      ],
    },
  );
});
