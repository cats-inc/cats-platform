import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { ChatComposerArea } from '../src/products/shared/renderer/components/chat-view/ChatComposerArea.tsx';
import {
  clearRememberedExecutionLabels,
  rememberExecutionLabel,
} from '../src/shared/executionLabel.ts';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: null,
      cats: [],
      capabilities: {
        maxAudienceParticipants: 3,
      },
    },
  } as unknown as AppShellPayload;
}

test('chat composer keeps solo implicit recipient controls on the active audience chip tooltip', () => {
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
          name: 'Claude-CLI · Opus · Max',
          provider: 'claude',
          instance: 'cli',
          model: 'opus',
          modelSelection: {
            entryMode: 'explicit',
            controls: {
              'claude.reasoning_effort': 'max',
            },
          },
        },
      ]}
      defaultRecipientParticipantId={null}
      composerStackParticipants={[]}
      isDirectLane={false}
      isSoloComposer
      activeWorkflowShape="sequential"
      onToggleActiveWorkflowShape={() => {}}
      activeAudienceKeys={null}
      onSetActiveAudienceKeys={() => {}}
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
  assert.match(markup, /class="audienceChipLabel">Claude-CLI[^<]*Max/u);
  assert.match(markup, /data-tooltip="Claude-CLI[^"]*Max"/u);
  assert.match(markup, /class="audienceChipChevron"/u);
  assert.doesNotMatch(markup, /class="audienceChipAvatar"/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
});

test('chat composer preserves runtime-backed implicit audience labels instead of rebuilding static fallback text', () => {
  clearRememberedExecutionLabels();
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
          name: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
          executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
          provider: 'claude',
          instance: 'cli/native',
          model: 'opus',
          modelSelection: {
            entryMode: 'explicit',
            controls: {
              'claude.reasoning_effort': 'xhigh',
            },
          },
        },
      ]}
      defaultRecipientParticipantId={null}
      composerStackParticipants={[]}
      isDirectLane={false}
      isSoloComposer
      activeWorkflowShape="sequential"
      onToggleActiveWorkflowShape={() => {}}
      activeAudienceKeys={null}
      onSetActiveAudienceKeys={() => {}}
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

  assert.match(markup, /class="audienceChipLabel">Claude-CLI[^<]*Opus 4\.7 with 1M context[^<]*xHigh/u);
  assert.match(markup, /data-tooltip="Claude-CLI[^"]*Opus 4\.7 with 1M context[^"]*xHigh/u);
  assert.doesNotMatch(markup, /Opus 4\.6 with 1M context/u);
  assert.doesNotMatch(markup, /Extra High/u);
  clearRememberedExecutionLabels();
});

test('chat composer renders a cat-backed audience chip for direct lanes', () => {
  clearRememberedExecutionLabels();
  rememberExecutionLabel({
    provider: 'claude',
    instance: 'native',
    model: 'opus',
    modelSelection: {
      controls: {
        'claude.reasoning_effort': 'xhigh',
      },
    },
    executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
  });
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
      defaultModelSelection: {
        entryMode: 'explicit',
        controls: {
          'claude.reasoning_effort': 'xhigh',
        },
      },
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
      activeWorkflowShape="sequential"
      onToggleActiveWorkflowShape={() => {}}
      activeAudienceKeys={null}
      onSetActiveAudienceKeys={() => {}}
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
  assert.match(markup, /data-tooltip="將將 · Claude-CLI[^"]*Opus 4\.7 with 1M context[^"]*xHigh/u);
  assert.doesNotMatch(markup, /Opus 4\.6 with 1M context/u);
  assert.doesNotMatch(markup, /Extra High/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="composerCatStack"/u);
  clearRememberedExecutionLabels();
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
      activeWorkflowShape="sequential"
      onToggleActiveWorkflowShape={() => {}}
      activeAudienceKeys={null}
      onSetActiveAudienceKeys={() => {}}
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
  assert.doesNotMatch(markup, /class="composerCatStack"/u);
});
