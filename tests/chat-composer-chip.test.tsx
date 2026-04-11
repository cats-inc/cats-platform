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

test('chat composer renders implicit single-recipient audience chips without avatar affordance', () => {
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
          name: 'Claude-CLI · Opus',
          provider: 'claude',
          instance: 'cli',
          model: 'opus',
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

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /class="audienceChipLabel">Claude-CLI/u);
  assert.match(markup, /class="audienceChipChevron"/u);
  assert.doesNotMatch(markup, /class="audienceChipAvatar"/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="modelSelectorChip"/u);
});

test('chat composer renders a cat-backed audience chip for direct lanes', () => {
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

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /class="audienceChipAvatar"/u);
  assert.match(markup, /class="audienceChipLabel">將將</u);
  assert.match(markup, /data-tooltip="將將 · Claude-CLI/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="modelSelectorChip"/u);
  assert.doesNotMatch(markup, /class="composerCatStack"/u);
});

test('chat composer renders a multi-audience chip for group chats', () => {
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
          name: 'Claude-CLI · Opus',
          provider: 'claude',
          instance: 'cli',
          model: 'opus',
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

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /data-tooltip="Select audience"/u);
  assert.match(markup, /class="audienceChipAvatar"/u);
  assert.match(markup, /class="audienceChipLabel">Claude-CLI \+2</u);
  assert.match(markup, /class="audienceChipWorkflow"/u);
  assert.match(markup, /data-tooltip="Sequential"/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="modelSelectorChip"/u);
  assert.doesNotMatch(markup, /class="composerCatStack"/u);
});
