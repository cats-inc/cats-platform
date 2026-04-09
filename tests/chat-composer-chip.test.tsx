import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { ChatComposerArea } from '../src/products/chat/renderer/components/chat-view/ChatComposerArea.tsx';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: null,
      cats: [],
    },
  } as unknown as AppShellPayload;
}

test('chat composer renders implicit single-recipient model chips without recipient plus icon', () => {
  const markup = renderToStaticMarkup(
    <ChatComposerArea
      hasConversationStarted
      isCompareGroup={false}
      isNearBottom
      payload={createPayload()}
      composerDraft="hello"
      channelFiles={[]}
      channelPlusMenuOpen={false}
      channelPlusMenuRef={{ current: null }}
      channelFileInputRef={{ current: null }}
      composerBusy={false}
      compareBusy={false}
      stopBusy={false}
      composerWorkspacePath={null}
      directLaneExcludedMentionNames={[]}
      composerRecipients={[
        {
          kind: 'implicit',
          name: 'Claude-CLI · Opus 4.6 with 1M context',
          provider: 'claude-cli',
          instance: null,
          model: 'opus-4.6-1m',
        },
      ]}
      isDirectLane={false}
      isSoloComposer
      compareSendScope="all_members"
      showCancelComposerAction={false}
      showStopComposerAction={false}
      composerCardRef={() => {}}
      onOpenSection={() => {}}
      onComposerChange={() => {}}
      onComposerKeyDown={() => {}}
      onSendMessage={() => {}}
      onToggleChannelPlusMenu={() => {}}
      onChannelFileSelect={() => {}}
      onChannelFilesChange={() => {}}
      onScrollToBottom={() => {}}
      autoResize={() => {}}
    />,
  );

  assert.match(markup, /class="modelSelectorChip"/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /recipientChipIcon/u);
});

test('chat composer restores single-avatar stack for direct lanes', () => {
  const payload = createPayload();
  payload.chat.bossCatId = 'cat-jiang';
  payload.chat.cats = [
    {
      id: 'cat-jiang',
      name: '將將',
      avatarColor: '#7A5B3A',
      avatarUrl: null,
      status: 'active',
      products: ['chat'],
      defaultExecutionTarget: {
        provider: 'claude',
        instance: 'native',
        model: 'opus',
      },
      defaultModelSelection: null,
    },
  ] as never;

  const markup = renderToStaticMarkup(
    <ChatComposerArea
      hasConversationStarted
      isCompareGroup={false}
      isNearBottom
      payload={payload}
      composerDraft="hello"
      channelFiles={[]}
      channelPlusMenuOpen={false}
      channelPlusMenuRef={{ current: null }}
      channelFileInputRef={{ current: null }}
      composerBusy={false}
      compareBusy={false}
      stopBusy={false}
      composerWorkspacePath={null}
      directLaneExcludedMentionNames={[]}
      composerRecipients={[
        {
          kind: 'named',
          catId: 'cat-jiang',
          name: '將將',
          avatarColor: '#7A5B3A',
          avatarUrl: null,
          provider: 'claude',
          instance: 'native',
          model: 'opus',
        },
      ]}
      isDirectLane
      isSoloComposer={false}
      compareSendScope="all_members"
      showCancelComposerAction={false}
      showStopComposerAction={false}
      composerCardRef={() => {}}
      onOpenSection={() => {}}
      onComposerChange={() => {}}
      onComposerKeyDown={() => {}}
      onSendMessage={() => {}}
      onToggleChannelPlusMenu={() => {}}
      onChannelFileSelect={() => {}}
      onChannelFilesChange={() => {}}
      onScrollToBottom={() => {}}
      autoResize={() => {}}
    />,
  );

  assert.match(markup, /class="composerCatStack"/u);
  assert.match(markup, /class="catAvatar composerStackAvatar catAvatarBoss"/u);
  assert.match(markup, /background:#7A5B3A/u);
  assert.match(markup, /color:#fff/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="modelSelectorChip"/u);
});
