import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  GuideCatAssistBundle,
  GuideCatAssistSurfaceReadModel,
} from '../src/shared/guideCatAssist.ts';
import {
  resolveLobbyGuideCatAssistBaseline,
  resolveNewCodeGuideCatAssistBaseline,
  resolveNewChatGuideCatAssistBaseline,
} from '../src/shared/guideCatAssistBaselines.ts';
import { resolveGuideCatAssistGreeting } from '../src/shared/guideCatAssistPresentation.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

function createReadModel(bundle: GuideCatAssistBundle): GuideCatAssistSurfaceReadModel {
  return {
    scopeKey: `${bundle.scope.surfaceId}:${bundle.scope.surfaceMode}:${bundle.scope.audienceState}`,
    bundle,
    renderSource: 'deterministic',
    cacheHit: false,
    missing: false,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
  };
}

test('deterministic Guide Cat assist greetings localize by selected baseline line', () => {
  const zh = createTranslator('zh-TW');
  const lobbyBundle = resolveLobbyGuideCatAssistBaseline();
  const localizedLobbyGreeting = resolveGuideCatAssistGreeting(
    createReadModel({
      ...lobbyBundle,
      content: {
        ...lobbyBundle.content,
        greeting: 'Choose a surface and get moving.',
      },
    }),
    zh,
  );
  assert.equal(localizedLobbyGreeting, '選擇一個產品開始。');

  const codeBundle = resolveNewCodeGuideCatAssistBaseline();
  const localizedCodeGreeting = resolveGuideCatAssistGreeting(
    createReadModel({
      ...codeBundle,
      content: {
        ...codeBundle.content,
        greeting: 'Open the repo and start small.',
      },
    }),
    zh,
  );
  assert.equal(localizedCodeGreeting, '開啟 repo，從小處開始。');
});

test('runtime Guide Cat assist greetings remain runtime-authored copy', () => {
  const zh = createTranslator('zh-TW');
  const lobbyBundle = resolveLobbyGuideCatAssistBaseline();
  const runtimeGreeting = resolveGuideCatAssistGreeting(
    createReadModel({
      ...lobbyBundle,
      content: {
        ...lobbyBundle.content,
        greeting: 'Cached lobby assist greeting.',
      },
      provenance: {
        ...lobbyBundle.provenance,
        originMode: 'runtime',
      },
    }),
    zh,
  );

  assert.equal(runtimeGreeting, 'Cached lobby assist greeting.');
});

test('Guide Cat assist baselines can be generated from the shared zh-TW catalog', () => {
  const zh = createTranslator('zh-TW');
  const codeBundle = resolveNewCodeGuideCatAssistBaseline({ t: zh });
  assert.equal(codeBundle.content.entryChips[0]?.label, '建置番茄鐘應用程式');
  assert.equal(codeBundle.content.entryChips[4]?.prompt, '開始一個小專案來追蹤里程碑。');

  const chatBundle = resolveNewChatGuideCatAssistBaseline({ t: zh });
  assert.equal(chatBundle.content.entryChips.length, 0);
  assert.ok(chatBundle.content.greeting);
});
