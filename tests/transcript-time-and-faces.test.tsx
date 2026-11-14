import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { TranscriptMessageItem } from '../src/products/shared/renderer/components/conversation-view/TranscriptMessageItem.tsx';
import { LiveTranscriptIndicator } from '../src/products/shared/renderer/components/conversation-view/LiveTranscriptIndicator.tsx';
import { EMPTY_LIVE_INDICATOR } from '../src/shared/liveIndicator.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catReachesTelegram } from '../src/products/shared/renderer/directMessageTelegram.ts';
import {
  dayLabel,
  dayStartKeys,
  messageTime,
  messageTimestamp,
  readMessageTime,
} from '../src/products/shared/renderer/messageTime.ts';
import type { ChatBotBindingSummary, ChatCat } from '../src/products/shared/api/workspaceContracts.ts';

// Desktop's transcript follows Cats Bot's notes: a time in every bubble, a divider per day, no face on the
// direct message's own cat, and Telegram's paper plane only for a cat that reaches Telegram.

const words = { today: 'Today', yesterday: 'Yesterday' };

test('a bubble shows the minute, its tooltip the whole date, and Chinese keeps 上午', () => {
  const at = new Date(2026, 10, 14, 7, 20, 38);
  assert.match(messageTime(at, 'en'), /^7:20\s?AM$/u);
  assert.equal(messageTime(at, 'zh-TW'), '上午7:20');
  assert.equal(messageTimestamp(at, 'zh-TW'), '2026年11月14日 星期六 上午7:20:38');
  assert.equal(readMessageTime('garbage'), null);
  assert.equal(readMessageTime(undefined), null);
});

test('days read Today, Yesterday, then the date, with the year once it is another year', () => {
  const now = new Date(2026, 10, 14, 9, 0);
  assert.equal(dayLabel(new Date(2026, 10, 14, 1, 0), now, 'en', words), 'Today');
  assert.equal(dayLabel(new Date(2026, 10, 13, 23, 0), now, 'zh-TW', { today: '今天', yesterday: '昨天' }), '昨天');
  assert.equal(dayLabel(new Date(2026, 10, 12, 7, 0), now, 'zh-TW', words), '11月12日 星期四');
  assert.equal(dayLabel(new Date(2025, 10, 12, 7, 0), now, 'zh-TW', words), '2025年11月12日 星期三');
  assert.equal(dayLabel(new Date(2026, 11, 31, 23, 0), new Date(2027, 0, 1, 8, 0), 'en', words), 'Yesterday');
});

test('only the first shown item of each day starts one; an item without a time neither starts nor ends a day', () => {
  const items = [
    { key: 'a', at: new Date(2026, 10, 12, 7, 0) },
    { key: 'b', at: new Date(2026, 10, 12, 9, 0) },
    { key: 'c', at: null },
    { key: 'd', at: new Date(2026, 10, 14, 1, 0) },
  ];
  assert.deepEqual([...dayStartKeys(items, (item) => item.at, (item) => item.key)], ['a', 'd']);
  // Going back a day (a line timed before the item above it) starts nothing.
  const back = [{ key: 'x', at: new Date(2026, 10, 14, 0, 1) }, { key: 'y', at: new Date(2026, 10, 13, 23, 59) }];
  assert.deepEqual([...dayStartKeys(back, (item) => item.at, (item) => item.key)], ['x']);
});

test('a direct message sends with the paper plane only for a cat with an active Telegram binding and its token', () => {
  const binding = (extra: Partial<ChatBotBindingSummary>) => ({
    id: 'b', platform: 'telegram', botName: 'bot', catId: 'mochi', catName: 'Mochi', inboundMode: 'polling',
    roomMode: 'direct', isBossBinding: false, status: 'active', outboundFanoutEnabled: true, updatedAt: '',
    webhookPath: '', hasBotToken: true, hasWebhookSecret: false, ...extra,
  }) as ChatBotBindingSummary;
  assert.equal(catReachesTelegram([binding({})], 'mochi'), true);
  assert.equal(catReachesTelegram([binding({})], 'tama'), false);
  assert.equal(catReachesTelegram([binding({ status: 'disabled' })], 'mochi'), false);
  assert.equal(catReachesTelegram([binding({ hasBotToken: false })], 'mochi'), false);
  assert.equal(catReachesTelegram([binding({ platform: 'line' })], 'mochi'), false);
  assert.equal(catReachesTelegram(undefined, 'mochi'), false);
  assert.equal(catReachesTelegram([binding({})], null), false);
});

const mochi = { id: 'mochi', name: 'Mochi', avatarUrl: null, avatarColor: '#888', roles: [] } as unknown as ChatCat;
const tama = { id: 'tama', name: 'Tama', avatarUrl: null, avatarColor: '#888', roles: [] } as unknown as ChatCat;

function message(senderKind: 'agent' | 'user' | 'system', senderName: string, body: string) {
  return {
    id: `${senderName}-${body}`, channelId: 'lane', senderKind, senderName, body, mentions: [], metadata: {},
    usage: null, createdAt: new Date(2026, 10, 14, 7, 20).toISOString(),
  };
}

function itemProps(item: ReturnType<typeof message>, extra: Record<string, unknown> = {}) {
  return {
    message: item, stackClassName: 'stack', cats: [mochi, tama], selectedChannelId: 'lane', disabledMentionNames: [],
    compareBusy: false, choiceBusy: false, isCompareGroup: false, relayMenuOpen: false,
    userTurnStatus: 'idle' as const, retryBusy: false, onChoiceSubmit: () => {}, onCopyMessage: async () => {},
    onToggleRelayMenu: () => {}, onCloseRelayMenu: () => {}, resolveMessageParticipant: () => null,
    resolveParticipantCatRecord: () => null, buildParticipantAvatarClassName: () => '',
    buildParticipantAvatarStyle: () => undefined, resolveParticipantAvatarUrl: () => null,
    resolveParticipantDisplayName: () => '', ...extra,
  } as unknown as React.ComponentProps<typeof TranscriptMessageItem>;
}

test('the direct message\'s own cat has no face over its bubbles; another cat keeps its face and name', (t) => {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  const own = render(<TranscriptMessageItem {...itemProps(message('agent', 'Mochi', 'hi'), { hideSpeakerCatId: 'mochi' })} />);
  assert.equal(own.container.querySelector('.transcriptMessageTop'), null);
  own.unmount();
  const other = render(<TranscriptMessageItem {...itemProps(message('agent', 'Tama', 'hello'), { hideSpeakerCatId: 'mochi' })} />);
  assert.match(other.container.querySelector('.transcriptMessageTop')?.textContent ?? '', /Tama/u);
  other.unmount();
  const group = render(<TranscriptMessageItem {...itemProps(message('agent', 'Mochi', 'hi'))} />);
  assert.match(group.container.querySelector('.transcriptMessageTop')?.textContent ?? '', /Mochi/u, 'a group shows every face');
  group.unmount();
});

test('every bubble but a system line closes with its time; copy takes the message alone', async (t) => {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  const copied: string[] = [];
  const reply = render(<TranscriptMessageItem {...itemProps(message('agent', 'Mochi', 'the reply'), {
    onCopyMessage: async (body: string) => { copied.push(body); },
  })} />);
  const time = reply.container.querySelector('.transcriptMessageTime');
  assert.ok(time?.closest('.transcriptMessage'), 'inside the bubble');
  assert.match(time?.textContent ?? '', /7:20/u);
  assert.ok(time?.getAttribute('data-tooltip'));
  fireEvent.click(reply.container.querySelector('button.messageActionIcon')!);
  assert.deepEqual(copied, ['the reply']);
  reply.unmount();
  const owner = render(<TranscriptMessageItem {...itemProps(message('user', 'You', 'question'))} />);
  assert.ok(owner.container.querySelector('.transcriptMessageTime'));
  owner.unmount();
  const notice = render(<TranscriptMessageItem {...itemProps(message('system', 'Chat', 'a notice'))} />);
  assert.equal(notice.container.querySelector('.transcriptMessageTime'), null);
  notice.unmount();
});

test('a reply being written in a direct message carries no face either, so the bubble does not change when it seals', (t) => {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  const participant = { participantId: 'participant-mochi' };
  const live = (hideSpeakerCatId: string | null) => (
    <LiveTranscriptIndicator
      cats={[mochi]} selectedChannelId="lane" disabledMentionNames={[]}
      liveIndicator={{ ...EMPTY_LIVE_INDICATOR, active: true, phase: 'streaming', participantId: 'participant-mochi',
        speakerLabel: 'Mochi', contentBlocks: [{ id: 'text:0', index: 0, kind: 'text', status: 'streaming', title: null,
          text: 'Looking into it', toolName: null, toolId: null, metadata: null }] }}
      liveSpeakerParticipant={participant} liveSpeakerParticipantCat={mochi}
      resolveLiveIndicatorSegmentParticipant={() => participant} resolveParticipantCatRecord={() => mochi}
      buildParticipantAvatarClassName={() => 'catAvatar'} buildParticipantAvatarStyle={() => undefined}
      resolveParticipantAvatarUrl={() => null} resolveParticipantDisplayName={() => 'Mochi'}
      showProgressDetails={false} hideSpeakerCatId={hideSpeakerCatId} />
  );
  const direct = render(live('mochi'));
  assert.match(direct.container.textContent ?? '', /Looking into it/u);
  assert.equal(direct.container.querySelector('.transcriptMessageTop'), null);
  direct.unmount();
  const group = render(live(null));
  assert.match(group.container.querySelector('.transcriptMessageTop')?.textContent ?? '', /Mochi/u);
  group.unmount();
  // The direct lane's cat reaches every bubble the transcript draws: messages, clusters and the live reply.
  const panel = readFileSync(join(process.cwd(),
    'src/products/shared/renderer/components/conversation-view/ConversationTranscriptPanel.tsx'), 'utf8');
  assert.equal(panel.match(/hideSpeakerCatId=\{directLaneCatId\}/gu)?.length, 3);
  const view = readFileSync(join(process.cwd(),
    'src/products/shared/renderer/components/conversation-view/ConversationView.tsx'), 'utf8');
  assert.match(view, /directLaneCatId=\{isDirectLane \? directLaneCat\?\.id \?\? null : null\}/u);
});

test('Telegram\'s paper plane is Chat\'s: Work and Code direct lanes keep the arrow', () => {
  const binding = { id: 'b', platform: 'telegram', botName: 'bot', catId: 'mochi', catName: 'Mochi',
    inboundMode: 'polling', roomMode: 'direct', isBossBinding: true, status: 'active', outboundFanoutEnabled: true,
    updatedAt: '', webhookPath: '', hasBotToken: true, hasWebhookSecret: false } as ChatBotBindingSummary;
  assert.equal(catReachesTelegram([binding], 'mochi', 'chat'), true, 'a Boss Cat binding names its cat');
  assert.equal(catReachesTelegram([binding], 'mochi', 'work'), false);
  assert.equal(catReachesTelegram([binding], 'mochi', 'code'), false);
});
