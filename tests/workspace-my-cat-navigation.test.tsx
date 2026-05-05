import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMyCatPathForPrefix,
  resolveMyCatStatusDot,
  statusDotClassName,
  statusDotLabel,
} from '../src/products/shared/renderer/myCatNavigation.ts';
import { resolveMyCatNavigationTarget as resolveCodeMyCatNavigationTarget } from '../src/products/code/renderer/myCatNavigation.ts';
import { resolveMyCatNavigationTarget as resolveWorkMyCatNavigationTarget } from '../src/products/work/renderer/myCatNavigation.ts';
import { messageKeys } from '../src/shared/i18n/messageKeys.ts';

test('buildMyCatPathForPrefix trims and encodes cat ids without leaking the chat prefix', () => {
  assert.equal(
    buildMyCatPathForPrefix('/work', '  companion/cat  '),
    '/work/dm/companion%2Fcat',
  );
  assert.equal(buildMyCatPathForPrefix('/code', '   '), '/code/dm');
});

test('workspace My Cats navigation targets stay product-local for work and code', () => {
  assert.deepEqual(resolveWorkMyCatNavigationTarget([], 'companion-cat'), {
    kind: 'direct_message',
    path: '/work/dm/companion-cat',
  });
  assert.deepEqual(resolveCodeMyCatNavigationTarget([], 'companion-cat'), {
    kind: 'direct_message',
    path: '/code/dm/companion-cat',
  });
});

test('My Cats status dots map runtime lease states onto stable class and label contracts', () => {
  assert.equal(resolveMyCatStatusDot('ready'), 'awake');
  assert.equal(resolveMyCatStatusDot('initializing'), 'waking_up');
  assert.equal(resolveMyCatStatusDot('not_started'), 'sleeping');
  assert.equal(resolveMyCatStatusDot('closed'), 'sleeping');
  assert.equal(resolveMyCatStatusDot('removed'), 'sleeping');
  assert.equal(resolveMyCatStatusDot('error'), 'error');
  assert.equal(resolveMyCatStatusDot(null), 'no_dot');

  assert.equal(statusDotClassName('awake'), 'myCatDot myCatDotAwake');
  assert.equal(statusDotClassName('waking_up'), 'myCatDot myCatDotWaking');
  assert.equal(statusDotClassName('sleeping'), 'myCatDot myCatDotSleeping');
  assert.equal(statusDotClassName('error'), 'myCatDot myCatDotError');
  assert.equal(statusDotClassName('no_dot'), '');

  assert.equal(statusDotLabel('awake'), messageKeys.chatLifecycleAwakeLabel);
  assert.equal(statusDotLabel('waking_up'), messageKeys.chatLifecycleWakingUpLabel);
  assert.equal(statusDotLabel('sleeping'), messageKeys.chatLifecycleSleepingLabel);
  assert.equal(statusDotLabel('error'), messageKeys.chatCatStatusErrorLabel);
  assert.equal(statusDotLabel('no_dot'), null);
});
