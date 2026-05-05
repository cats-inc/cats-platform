import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCT_INTENT_COMMAND_NAMES,
  isProductIntentCommandName,
  parseProductIntentCommand,
} from '../src/products/chat/shared/productIntentCommands.js';

test('parseProductIntentCommand recognizes direct product-intent commands', () => {
  assert.deepEqual(PRODUCT_INTENT_COMMAND_NAMES, ['chat', 'work', 'code']);

  for (const command of PRODUCT_INTENT_COMMAND_NAMES) {
    const parsed = parseProductIntentCommand(`/${command}`);
    assert.equal(parsed?.kind, 'product_intent_command');
    assert.equal(parsed?.command, command);
    assert.equal(parsed?.posture, command);
    assert.equal(parsed?.targetProduct, command);
    assert.equal(parsed?.argumentText, '');
  }
});

test('parseProductIntentCommand strips Telegram bot suffixes and preserves arguments', () => {
  const parsed = parseProductIntentCommand('  /Work@CatsBot  build a settings smoke test  ');

  assert.deepEqual(parsed, {
    kind: 'product_intent_command',
    command: 'work',
    posture: 'work',
    targetProduct: 'work',
    rawCommandToken: 'Work@CatsBot',
    botSuffix: 'CatsBot',
    argumentText: 'build a settings smoke test',
    originalText: '  /Work@CatsBot  build a settings smoke test  ',
    normalizedText: '/Work@CatsBot  build a settings smoke test',
  });
});

test('parseProductIntentCommand handles multiline argument text without transport parsing', () => {
  const parsed = parseProductIntentCommand('/code\nFix the parser\nKeep tests small');

  assert.equal(parsed?.kind, 'product_intent_command');
  assert.equal(parsed?.command, 'code');
  assert.equal(parsed?.argumentText, 'Fix the parser\nKeep tests small');
});

test('parseProductIntentCommand keeps transport-control commands outside product intent', () => {
  for (const command of ['start', 'help', 'commands', 'status', 'mode']) {
    const parsed = parseProductIntentCommand(`/${command} now`);
    assert.deepEqual(parsed, {
      kind: 'non_product_slash_command',
      commandName: command,
      rawCommandToken: command,
      botSuffix: null,
      argumentText: 'now',
      originalText: `/${command} now`,
      normalizedText: `/${command} now`,
    });
  }
});

test('parseProductIntentCommand does not match longer slash commands by prefix', () => {
  const parsed = parseProductIntentCommand('/workshop create a plan');

  assert.equal(parsed?.kind, 'non_product_slash_command');
  assert.equal(parsed?.commandName, 'workshop');
  assert.equal(parsed?.argumentText, 'create a plan');
});

test('parseProductIntentCommand returns null for ordinary text', () => {
  assert.equal(parseProductIntentCommand('please start work mode'), null);
  assert.equal(parseProductIntentCommand(''), null);
  assert.equal(parseProductIntentCommand(null), null);
  assert.equal(parseProductIntentCommand(undefined), null);
});

test('isProductIntentCommandName narrows only canonical product intent commands', () => {
  assert.equal(isProductIntentCommandName('chat'), true);
  assert.equal(isProductIntentCommandName('work'), true);
  assert.equal(isProductIntentCommandName('code'), true);
  assert.equal(isProductIntentCommandName('mode'), false);
  assert.equal(isProductIntentCommandName('Work'), false);
});
