import {
  type MessageBodyAttachment,
  type MessageBodySegment,
} from './types/messageBody';

/**
 * Fixed corpus for the Phase-2 visual gate. Each sample mirrors a
 * canonical bubble shape rendered by the web `MessageBody`: plain text,
 * paragraph with URL, paragraph with mention, mention + URL, image
 * attachment, file attachment, and a mixed bubble. The visual gate
 * compares these renderings to web screenshots at 320 × 568, 390 × 844,
 * and 768 × 1024 logical CSS px (NFR-002).
 *
 * Since the shared segmenter is not yet importable on the mobile side,
 * the segments here are pre-built. Once Metro resolution to the shared
 * file lands the harness should derive segments from raw bodies through
 * the real `segmentMessageBody` instead.
 */
export interface SampleBubble {
  id: string;
  role: 'user' | 'assistant';
  description: string;
  segments: MessageBodySegment[];
  attachments: MessageBodyAttachment[];
}

const ORANGE_AVATAR = '#C4653A';
const TEAL_AVATAR = '#2F7B7A';

export const sampleBubbles: SampleBubble[] = [
  {
    id: 'plain-user',
    role: 'user',
    description: 'Plain text user bubble',
    segments: [
      {
        kind: 'text',
        value: 'Can you summarize what changed in the runtime layer last week?',
      },
    ],
    attachments: [],
  },
  {
    id: 'plain-assistant',
    role: 'assistant',
    description: 'Plain text assistant bubble (multi-line)',
    segments: [
      {
        kind: 'text',
        value:
          'Three things landed:\n  • Per-entity state subscription rolled out\n  • Schedule rules triggered missions for the first time\n  • Recipient-state routing replaced cat_led short-circuit',
      },
    ],
    attachments: [],
  },
  {
    id: 'with-link',
    role: 'assistant',
    description: 'Assistant bubble with a single URL segment',
    segments: [
      {
        kind: 'text',
        value: 'See the rollout plan at ',
      },
      {
        kind: 'url',
        value: 'https://github.com/cats-inc/cats-platform/pull/1234',
        href: 'https://github.com/cats-inc/cats-platform/pull/1234',
      },
      {
        kind: 'text',
        value: ' for the full diff.',
      },
    ],
    attachments: [],
  },
  {
    id: 'with-mention',
    role: 'user',
    description: 'User bubble with a default-coloured mention chip',
    segments: [
      {
        kind: 'text',
        value: 'Hey ',
      },
      {
        kind: 'mention',
        value: '@boss-cat',
        avatarColor: null,
      },
      {
        kind: 'text',
        value: ', can you take this one?',
      },
    ],
    attachments: [],
  },
  {
    id: 'with-coloured-mention',
    role: 'assistant',
    description: 'Assistant bubble with two coloured mentions in a row',
    segments: [
      {
        kind: 'mention',
        value: '@coder',
        avatarColor: ORANGE_AVATAR,
      },
      {
        kind: 'text',
        value: ' will draft, ',
      },
      {
        kind: 'mention',
        value: '@reviewer',
        avatarColor: TEAL_AVATAR,
      },
      {
        kind: 'text',
        value: ' will sign off.',
      },
    ],
    attachments: [],
  },
  {
    id: 'with-image-attachment',
    role: 'user',
    description: 'User bubble with one image attachment + caption',
    segments: [
      {
        kind: 'text',
        value: 'Here is the screenshot from the review.',
      },
    ],
    attachments: [
      {
        filename: 'review-screenshot.png',
        relativePath: 'attachments/review-screenshot.png',
        isImage: true,
      },
    ],
  },
  {
    id: 'with-file-chip',
    role: 'user',
    description: 'User bubble with one non-image attachment chip',
    segments: [
      {
        kind: 'text',
        value: 'Spec attached.',
      },
    ],
    attachments: [
      {
        filename: 'SPEC-095-mobile-shell.md',
        relativePath: 'attachments/SPEC-095-mobile-shell.md',
        isImage: false,
      },
    ],
  },
  {
    id: 'mixed',
    role: 'assistant',
    description: 'Assistant bubble: link + mention + multiple file chips',
    segments: [
      {
        kind: 'text',
        value: 'Routing rebuilt per ',
      },
      {
        kind: 'url',
        value: 'https://example.com/adr-091',
        href: 'https://example.com/adr-091',
      },
      {
        kind: 'text',
        value: ' — please review with ',
      },
      {
        kind: 'mention',
        value: '@router-cat',
        avatarColor: ORANGE_AVATAR,
      },
      {
        kind: 'text',
        value: '.',
      },
    ],
    attachments: [
      {
        filename: 'mention-router.ts',
        relativePath: 'attachments/mention-router.ts',
        isImage: false,
      },
      {
        filename: 'orchestrator-routing.ts',
        relativePath: 'attachments/orchestrator-routing.ts',
        isImage: false,
      },
    ],
  },
];
