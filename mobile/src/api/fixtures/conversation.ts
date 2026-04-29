import type {
  MessageBodyAttachment,
  MessageBodySegment,
} from '../../../../src/mobile/index.js';

/**
 * Fixture conversation used by the Phase-4a ChatView shell. Three sample
 * conversations cover the three product modes (chat / code / work) so
 * the same ChatView can be exercised from all three sidebars before live
 * data lands. PLAN-084 Phase 4b swaps this for the real chat API client.
 */

export interface FixtureMessage {
  id: string;
  role: 'user' | 'assistant';
  authorName: string;
  segments: MessageBodySegment[];
  attachments: MessageBodyAttachment[];
  /** Epoch milliseconds. */
  timestamp: number;
}

export interface FixtureConversation {
  channelId: string;
  title: string;
  productMode: 'chat' | 'code' | 'work';
  messages: FixtureMessage[];
}

const ORANGE_AVATAR = '#C4653A';

const CHAT_DEFAULT_CONVERSATION: FixtureConversation = {
  channelId: 'channel-runtime-debug',
  title: 'Runtime debug — slow session diagnostics',
  productMode: 'chat',
  messages: [
    {
      id: 'm-1',
      role: 'user',
      authorName: 'Owner',
      timestamp: Date.parse('2026-04-29T02:14:00Z'),
      segments: [
        {
          kind: 'text',
          value:
            'Sessions are taking 8s+ to settle today. Can you take a look?',
        },
      ],
      attachments: [],
    },
    {
      id: 'm-2',
      role: 'assistant',
      authorName: 'Boss Cat',
      timestamp: Date.parse('2026-04-29T02:14:30Z'),
      segments: [
        {
          kind: 'text',
          value:
            'Looking now. The slow-session diagnostics in d1c7d3f4 highlight runtime stream timeouts as the most likely cause.',
        },
      ],
      attachments: [],
    },
    {
      id: 'm-3',
      role: 'assistant',
      authorName: 'Boss Cat',
      timestamp: Date.parse('2026-04-29T02:15:30Z'),
      segments: [
        {
          kind: 'text',
          value: 'Pulled the relevant ADR — see ',
        },
        {
          kind: 'url',
          value: 'https://example.com/adr-089',
          href: 'https://example.com/adr-089',
        },
        {
          kind: 'text',
          value: '. ',
        },
        {
          kind: 'mention',
          value: '@runtime-cat',
          avatarColor: ORANGE_AVATAR,
        },
        {
          kind: 'text',
          value: ' should weigh in.',
        },
      ],
      attachments: [],
    },
    {
      id: 'm-4',
      role: 'user',
      authorName: 'Owner',
      timestamp: Date.parse('2026-04-29T02:16:00Z'),
      segments: [
        { kind: 'text', value: 'Spec attached for context.' },
      ],
      attachments: [
        {
          filename: 'SPEC-runtime-timeouts.md',
          relativePath: 'attachments/SPEC-runtime-timeouts.md',
          isImage: false,
        },
      ],
    },
  ],
};

const CODE_DEFAULT_CONVERSATION: FixtureConversation = {
  ...CHAT_DEFAULT_CONVERSATION,
  channelId: 'channel-code-bug-fix',
  title: 'Fix login bug',
  productMode: 'code',
  messages: [
    {
      id: 'cm-1',
      role: 'user',
      authorName: 'Owner',
      timestamp: Date.parse('2026-04-29T09:00:00Z'),
      segments: [
        {
          kind: 'text',
          value: 'The login flow drops the session token after redirect.',
        },
      ],
      attachments: [],
    },
    {
      id: 'cm-2',
      role: 'assistant',
      authorName: 'Coder Cat',
      timestamp: Date.parse('2026-04-29T09:00:45Z'),
      segments: [
        {
          kind: 'text',
          value:
            'On it — running the auth tests first to reproduce, then I will draft a fix.',
        },
      ],
      attachments: [],
    },
  ],
};

const WORK_DEFAULT_CONVERSATION: FixtureConversation = {
  ...CHAT_DEFAULT_CONVERSATION,
  channelId: 'channel-work-mobile-shell',
  title: 'Mobile shell rollout',
  productMode: 'work',
  messages: [
    {
      id: 'wm-1',
      role: 'user',
      authorName: 'Owner',
      timestamp: Date.parse('2026-04-29T11:30:00Z'),
      segments: [
        {
          kind: 'text',
          value: 'Set up project for the mobile shell rollout per PLAN-084.',
        },
      ],
      attachments: [],
    },
    {
      id: 'wm-2',
      role: 'assistant',
      authorName: 'Project Cat',
      timestamp: Date.parse('2026-04-29T11:30:30Z'),
      segments: [
        {
          kind: 'text',
          value:
            'Project created with 8 phases. Phase 1-3 are scoped, Phase 4 broken into 4a / 4b / 4c.',
        },
      ],
      attachments: [],
    },
  ],
};

export function getFixtureConversation(
  channelId: string,
  productMode: 'chat' | 'code' | 'work',
): FixtureConversation {
  // The fixtures key by productMode for now — every channelId in a given
  // product currently resolves to the same canned conversation. Phase 4b
  // swaps this for live data per channelId.
  switch (productMode) {
    case 'chat':
      return { ...CHAT_DEFAULT_CONVERSATION, channelId };
    case 'code':
      return { ...CODE_DEFAULT_CONVERSATION, channelId };
    case 'work':
      return { ...WORK_DEFAULT_CONVERSATION, channelId };
  }
}
