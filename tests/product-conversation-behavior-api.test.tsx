import assert from 'node:assert/strict';
import test from 'node:test';

import { updateProductConversationBehaviorPreference } from '../src/app/renderer/settings/productConversationBehaviorApi.ts';
import type { ConversationBehaviorSurface } from '../src/products/shared/conversationBehavior.ts';

function createAppShellPayload(surface: ConversationBehaviorSurface) {
  return {
    chat: {
      id: 'chat',
      name: 'Cats Chat',
      selectedChannelId: '',
      bossCatId: null,
      cats: [],
      channels: [],
      parallelChatGroups: [],
      selectedChannel: null,
      globalOrchestrator: {},
      conversationBehavior: {
        [surface]: {
          showVerboseMessages: true,
        },
      },
      botBindings: [],
    },
  };
}

test('product conversation behavior settings route through product-owned renderer delegates', async () => {
  const surfaces: ConversationBehaviorSurface[] = ['chat', 'work', 'code'];
  const originalFetch = globalThis.fetch;

  try {
    for (const surface of surfaces) {
      const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
      globalThis.fetch = async (input, init) => {
        calls.push({ url: String(input), init });
        if (String(input) === '/api/preferences') {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(createAppShellPayload(surface)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const payload = await updateProductConversationBehaviorPreference(surface, {
        showVerboseMessages: true,
      });

      assert.equal(calls[0]?.url, '/api/preferences');
      assert.equal(calls[0]?.init?.method, 'PATCH');
      assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
        conversationBehavior: {
          [surface]: {
            showVerboseMessages: true,
          },
        },
      });
      assert.equal(calls[1]?.url, '/api/app-shell');
      assert.equal(payload.chat.conversationBehavior?.[surface].showVerboseMessages, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
