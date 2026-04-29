import { createHash } from 'node:crypto';

import {
  GUIDE_CAT_ASSIST_REFRESH_CONTEXT_HASH_PREFIX,
  GUIDE_CAT_ASSIST_V1_CHAT_NEW_SCOPE_KEYS_BY_MODE,
  GUIDE_CAT_ASSIST_V1_SCOPE_KEYS,
  createGuideCatAssistBundleId,
  type GuideCatAssistBundle,
  type GuideCatAssistContent,
  type GuideCatAssistNewChatMode,
  type GuideCatAssistScope,
} from './guideCatAssist.js';

const EPOCH_ISO = new Date(0).toISOString();

export const LOBBY_GREETING_LINES = [
  'Choose a surface and get moving.',
  'Home base is ready.',
  'Chat, Work, or Code. Your call.',
  'Everything is staged. Pick a lane.',
  'Open the surface that fits the task.',
  'Cats Inc is awake.',
  'Continue where the work makes sense.',
];

export const DRAFT_GREETING_LINES = [
  'Meow. Ready when you are.',
  'Your cat hasn\'t napped yet.',
  'Cats on the keyboard.',
  'Tail up, let\'s go.',
  'Purring in standby.',
  'Claws sharpened. What\'s the task?',
  'This cat doesn\'t sleep on the job.',
];

export const CODE_DRAFT_GREETING_LINES = [
  'Ready to code.',
  'Open the repo and start small.',
  'Build, fix, or refactor something real.',
  'Ship one clear improvement.',
  'Start with the smallest useful change.',
];

function withCatName(
  template: string,
  catName: string | null | undefined,
  fallback: string,
): string {
  const name = catName?.trim() || fallback;
  return template.replaceAll('{cat}', name);
}

function buildDeterministicRefreshContextHash(scopeKey: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      scopeKey,
      kind: 'deterministic-baseline',
    }))
    .digest('hex')
    .slice(0, 16);
  return `${GUIDE_CAT_ASSIST_REFRESH_CONTEXT_HASH_PREFIX}:baseline:${digest}`;
}

function selectDeterministicLine(
  pool: ReadonlyArray<string>,
  options: {
    scopeKey: string;
    seed?: string | null;
  },
): string | null {
  const normalizedPool = pool
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (normalizedPool.length === 0) {
    return null;
  }

  const digest = createHash('sha256')
    .update(`${options.seed ?? ''}:${options.scopeKey}`)
    .digest();
  const index = digest[0] % normalizedPool.length;
  return normalizedPool[index] ?? normalizedPool[0] ?? null;
}

function createDeterministicBaselineBundle(
  scope: GuideCatAssistScope,
  content: GuideCatAssistContent,
): GuideCatAssistBundle {
  const scopeKey = `${scope.surfaceId}:${scope.surfaceMode}:${scope.audienceState}`;
  return {
    bundleId: createGuideCatAssistBundleId(scope),
    scope,
    content,
    provenance: {
      originMode: 'deterministic',
      refreshContextHash: buildDeterministicRefreshContextHash(scopeKey),
      missionId: null,
      runId: null,
    },
    freshness: {
      generatedAt: EPOCH_ISO,
      expiresAt: null,
      lastRefreshStatus: 'never',
    },
  };
}

export function resolveLobbyGuideCatAssistBaseline(options: {
  seed?: string | null;
} = {}): GuideCatAssistBundle {
  const scope: GuideCatAssistScope = {
    surfaceId: 'lobby',
    surfaceMode: 'default',
    audienceState: 'default',
  };
  return createDeterministicBaselineBundle(scope, {
    greeting: selectDeterministicLine(LOBBY_GREETING_LINES, {
      scopeKey: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
      seed: options.seed,
    }),
    entryChips: [],
  });
}

export function resolveDraftStarterSuggestionsBaseline(input: {
  mode: GuideCatAssistNewChatMode;
  defaultRecipientName?: string | null;
}): GuideCatAssistContent['entryChips'] {
  switch (input.mode) {
    case 'direct':
      return [
        {
          id: 'direct-update',
          prompt: withCatName(
            'Ask {cat} for a focused update or recommendation on this task.',
            input.defaultRecipientName,
            'this Cat',
          ),
        },
        {
          id: 'direct-next-step',
          prompt: withCatName(
            'Give {cat} a concrete task and ask for the next step.',
            input.defaultRecipientName,
            'this Cat',
          ),
        },
        {
          id: 'direct-iterate',
          prompt: withCatName(
            'Use this lane to iterate quickly with {cat} on one problem.',
            input.defaultRecipientName,
            'this Cat',
          ),
        },
      ];
    case 'participant':
      return [
        {
          id: 'participant-first-pass',
          prompt: withCatName(
            'Ask {cat} to take the first pass, then tighten the plan together.',
            input.defaultRecipientName,
            'this Cat',
          ),
        },
        {
          id: 'participant-review',
          prompt: withCatName(
            'Have {cat} review an idea and suggest the next concrete moves.',
            input.defaultRecipientName,
            'this Cat',
          ),
        },
        {
          id: 'participant-brief',
          prompt: withCatName(
            'Let {cat} turn a rough brief into a clear action plan.',
            input.defaultRecipientName,
            'this Cat',
          ),
        },
      ];
    case 'group':
      return [
        {
          id: 'group-roles',
          prompt: 'Brief the group, split roles, and ask for a coordinated plan.',
        },
        {
          id: 'group-compare',
          prompt: 'Have the group compare options and surface the tradeoffs.',
        },
        {
          id: 'group-next-steps',
          prompt: 'Ask the group to propose next steps and who should own each one.',
        },
      ];
    case 'parallel':
      return [
        {
          id: 'parallel-compare',
          prompt: 'Compare how different models would approach the same task.',
        },
        {
          id: 'parallel-options',
          prompt: 'Ask for multiple approaches, then decide which direction to keep.',
        },
        {
          id: 'parallel-tradeoffs',
          prompt: 'Run one prompt across models and compare quality, speed, and tradeoffs.',
        },
      ];
    case 'solo':
    default:
      return [
        {
          id: 'solo-plan',
          prompt: 'Plan today\'s priorities and turn them into next actions.',
        },
        {
          id: 'solo-draft',
          prompt: 'Draft a message, post, or document from a rough idea.',
        },
        {
          id: 'solo-decide',
          prompt: 'Review a problem and propose two or three ways to tackle it.',
        },
      ];
  }
}

export function resolveNewChatGuideCatAssistBaseline(input: {
  mode: GuideCatAssistNewChatMode;
  defaultRecipientName?: string | null;
  seed?: string | null;
}): GuideCatAssistBundle {
  const scope: GuideCatAssistScope = {
    surfaceId: 'chat:new',
    surfaceMode: input.mode,
    audienceState: 'default',
  };
  const scopeKey = GUIDE_CAT_ASSIST_V1_CHAT_NEW_SCOPE_KEYS_BY_MODE[input.mode];
  return createDeterministicBaselineBundle(scope, {
    greeting: selectDeterministicLine(DRAFT_GREETING_LINES, {
      scopeKey,
      seed: input.seed,
    }),
    entryChips: resolveDraftStarterSuggestionsBaseline({
      mode: input.mode,
      defaultRecipientName: input.defaultRecipientName,
    }),
  });
}

export function resolveNewCodeGuideCatAssistBaseline(options: {
  seed?: string | null;
} = {}): GuideCatAssistBundle {
  const scope: GuideCatAssistScope = {
    surfaceId: 'code:new',
    surfaceMode: 'default',
    audienceState: 'default',
  };
  return createDeterministicBaselineBundle(scope, {
    greeting: selectDeterministicLine(CODE_DRAFT_GREETING_LINES, {
      scopeKey: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.codeNewDefault,
      seed: options.seed,
    }),
    entryChips: [
      {
        id: 'code-pomodoro',
        label: 'Pomodoro app',
        prompt: 'Write a small pomodoro timer app.',
      },
      {
        id: 'code-fix-bug',
        label: 'Fix a bug',
        prompt: 'Find and fix a bug in this codebase.',
      },
      {
        id: 'code-refactor',
        label: 'Refactor code',
        prompt: 'Refactor this code without changing behavior.',
      },
    ],
  });
}
