import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseMentions,
  parseMentionsWithPositions,
} from '../build/server/shared/mentionParsing.js';

test('shared mention parsing returns unique mention names in encounter order', () => {
  assert.deepEqual(
    parseMentions('Ask @Mochi to pair with @Ghost, then check @Mochi again.'),
    ['Mochi', 'Ghost'],
  );
});

test('shared mention parsing preserves mention positions for renderer highlighting', () => {
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

test('known names may contain spaces and the longest known name wins', () => {
  const knownNames = ['Builder', 'Builder Cat'];
  assert.deepEqual(parseMentions('@Builder Cat 請在工作區建立', { knownNames }), ['Builder Cat']);
  assert.deepEqual(parseMentions('@Builder Cat and @Builder, go', { knownNames }), ['Builder Cat', 'Builder']);
  assert.deepEqual(parseMentions('@builder cat', { knownNames }), ['builder cat'], 'case is preserved as typed');
  assert.deepEqual(parseMentions('@Builder Cat 請在工作區建立'), ['Builder'], 'without known names only a token is read');
  assert.deepEqual(
    parseMentionsWithPositions('Thanks @Builder Cat.', { knownNames }),
    { names: ['Builder Cat'], positions: [{ name: 'Builder Cat', start: 7, end: 19 }] },
  );
});

test('a known name must end at a word boundary, and CJK text may follow directly', () => {
  assert.deepEqual(parseMentions('@Builder Cats', { knownNames: ['Builder Cat'] }), ['Builder']);
  assert.deepEqual(parseMentions('@Builder.v2 ships', { knownNames: ['Builder'] }), ['Builder.v2']);
  assert.deepEqual(parseMentions('@Builder-bot', { knownNames: ['Builder'] }), ['Builder-bot']);
  assert.deepEqual(parseMentions('@Builder請幫忙', { knownNames: ['Builder'] }), ['Builder']);
  assert.deepEqual(parseMentions('@小明請看一下', { knownNames: ['小明'] }), ['小明']);
  assert.deepEqual(parseMentions('mail me at a@Builder Cat', { knownNames: ['Builder Cat'] }), []);
});

test('excluded names apply to the full known name', () => {
  assert.deepEqual(
    parseMentions('@Builder Cat and @Mochi', { knownNames: ['Builder Cat'], excludedNames: ['builder cat'] }),
    ['Mochi'],
  );
});

