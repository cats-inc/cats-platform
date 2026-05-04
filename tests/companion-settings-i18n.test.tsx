import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { CompanionSettingsSection } from '../src/products/chat/renderer/components/companion/CompanionSettingsSection.tsx';

test('companion settings localizes Telegram inbound mode labels', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/chat">
      <I18nProvider locale="zh-TW" languagePreference="zh-TW">
        <CompanionSettingsSection
          catId="cat-1"
          responseProfile={{
            expressionMode: 'mixed',
            outputMode: 'text',
            voiceProfileId: null,
            notes: null,
            updatedAt: '2026-05-04T00:00:00.000Z',
          }}
          payload={{
            chat: {
              botBindings: [{
                id: 'binding-1',
                catId: 'cat-1',
                botName: 'helper_bot',
                platform: 'telegram',
                status: 'active',
                inboundMode: 'polling',
              }],
            },
          } as unknown as AppShellPayload}
          loading={false}
          onUpdateResponseProfile={async () => {}}
        />
      </I18nProvider>
    </StaticRouter>,
  );

  assert.match(markup, /輪詢/u);
  assert.doesNotMatch(markup, />polling</u);
});
