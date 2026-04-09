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
      defaultRecipientParticipantId={null}
      composerStackParticipants={[]}
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
      defaultRecipientParticipantId="cat-jiang"
      composerStackParticipants={[
        {
          participantId: 'cat-jiang',
          label: '將將',
          avatarColor: '#7A5B3A',
          avatarUrl: null,
          isBoss: true,
          useNeutralAvatar: false,
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
  assert.match(markup, /data-tooltip="將將"/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="modelSelectorChip"/u);
});

test('chat composer restores avatar stack for group chats instead of a model chip', () => {
  const payload = createPayload();
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
          kind: 'implicit',
          name: 'Claude-CLI · Opus 4.6 with 1M context',
          provider: 'claude-cli',
          instance: null,
          model: 'opus-4.6-1m',
        },
      ]}
      defaultRecipientParticipantId="claude"
      composerStackParticipants={[
        {
          participantId: 'claude',
          label: 'Claude-CLI',
          avatarColor: null,
          avatarUrl: null,
          isBoss: false,
          useNeutralAvatar: true,
        },
        {
          participantId: 'codex',
          label: 'Codex-CLI',
          avatarColor: null,
          avatarUrl: null,
          isBoss: false,
          useNeutralAvatar: true,
        },
        {
          participantId: 'gemini',
          label: 'Gemini-CLI',
          avatarColor: null,
          avatarUrl: null,
          isBoss: false,
          useNeutralAvatar: true,
        },
      ]}
      isDirectLane={false}
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
  assert.match(markup, /data-tooltip="Claude-CLI"/u);
  assert.match(markup, /data-tooltip="Codex-CLI"/u);
  assert.match(markup, /data-tooltip="Gemini-CLI"/u);
  assert.match(markup, /channelParticipantAvatar/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="modelSelectorChip"/u);
});
