import assert from 'node:assert/strict';
import test from 'node:test';
import type { GuideCatAssistBundle, GuideCatAssistSurfaceReadModel } from '../src/shared/guideCatAssist.ts';
import { resolveGuideCatAssistBaseline } from '../src/shared/guideCatAssistBaselines.ts';
import { resolveGuideCatAssistGreeting } from '../src/shared/guideCatAssistPresentation.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';
function readModel(bundle: GuideCatAssistBundle): GuideCatAssistSurfaceReadModel {
  return { scopeKey: bundle.bundleId, bundle, renderSource: 'deterministic', cacheHit: false,
    missing: true, stale: false, refreshEligible: false, surfaceDisabled: false, lastFailure: null };
}
test('builtin greeting pools translate at display time and rotate across enabled entries', () => {
  const en = createTranslator('en'), zh = createTranslator('zh-TW');
  for (const surface of ['lobby', 'chat:new', 'code:new', 'work:new']) {
    const assist = readModel(resolveGuideCatAssistBaseline(surface));
    const first = assist.bundle.content.greetings[0];
    assert.ok(first.messageKey);
    assert.equal(resolveGuideCatAssistGreeting(assist, zh, 0), zh(first.messageKey as Parameters<typeof zh>[0]));
    assert.equal(resolveGuideCatAssistGreeting(assist, en, 0), first.text);
    assert.notEqual(resolveGuideCatAssistGreeting(assist, en, 0), resolveGuideCatAssistGreeting(assist, en, 0.999));
  }
});
test('owner and generated greeting text is preserved without builtin string matching', () => {
  const assist = readModel(resolveGuideCatAssistBaseline('lobby'));
  assist.bundle.content.greetings = [{ id: 'owner', text: 'Owner greeting' }];
  assert.equal(resolveGuideCatAssistGreeting(assist, createTranslator('zh-TW'), 0), 'Owner greeting');
});
test('all draft builtin chip catalogs carry explicit product targets and translation keys', () => {
  for (const surface of ['chat:new', 'code:new', 'work:new']) {
    const bundle = resolveGuideCatAssistBaseline(surface);
    assert.equal(bundle.content.entryChips.length, 5);
    for (const chip of bundle.content.entryChips) {
      assert.equal(chip.action, 'prefill');
      if (chip.action !== 'prefill') assert.fail('builtin must prefill');
      assert.ok(chip.labelKey); assert.ok(chip.promptKey); assert.ok(chip.surface);
    }
  }
  const chat = resolveGuideCatAssistBaseline('chat:new').content.entryChips;
  assert.equal(chat[3].action === 'prefill' && chat[3].surface, 'code');
  assert.equal(chat[4].action === 'prefill' && chat[4].surface, 'work');
});
