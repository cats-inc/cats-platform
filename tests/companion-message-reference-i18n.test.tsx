import assert from 'node:assert/strict';
import test from 'node:test';

import {
  labelCompanionReferenceInvalidReason,
} from '../src/products/shared/renderer/components/chat-view/CompanionMessageReferencePreviews.tsx';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('companion message reference invalid reasons localize parser tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    labelCompanionReferenceInvalidReason('wrong_scheme', t),
    '參考必須使用 cats://。',
  );
  assert.equal(
    labelCompanionReferenceInvalidReason('wrong_host', t),
    '參考必須指向 companion。',
  );
  assert.equal(
    labelCompanionReferenceInvalidReason('malformed_percent_encoding', t),
    '參考包含錯誤的百分比編碼。',
  );
  assert.equal(
    labelCompanionReferenceInvalidReason('bad_segment_count', t),
    '參考路徑段數不正確。',
  );
  assert.equal(
    labelCompanionReferenceInvalidReason('empty_path_segment', t),
    '參考包含空白路徑段。',
  );
  assert.equal(
    labelCompanionReferenceInvalidReason('unknown_target_type', t),
    '參考目標類型未知。',
  );
});
