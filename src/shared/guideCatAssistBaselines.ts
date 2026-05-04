import { createHash } from 'node:crypto';

import {
  CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
  CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
  LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS,
  translateGuideCatAssistLines,
  type GuideCatAssistTranslator,
} from './guideCatAssistPresentation.js';
import {
  createTranslator,
  messageKeys,
} from './i18n/index.js';
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
const defaultGuideCatAssistTranslator = createTranslator('en');

export const LOBBY_GREETING_LINES = translateGuideCatAssistLines(
  LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS,
  defaultGuideCatAssistTranslator,
);

export const DRAFT_GREETING_LINES = translateGuideCatAssistLines(
  CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
  defaultGuideCatAssistTranslator,
);

export const CODE_DRAFT_GREETING_LINES = translateGuideCatAssistLines(
  CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
  defaultGuideCatAssistTranslator,
);

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
  t?: GuideCatAssistTranslator;
} = {}): GuideCatAssistBundle {
  const t = options.t ?? defaultGuideCatAssistTranslator;
  const scope: GuideCatAssistScope = {
    surfaceId: 'lobby',
    surfaceMode: 'default',
    audienceState: 'default',
  };
  return createDeterministicBaselineBundle(scope, {
    greeting: selectDeterministicLine(translateGuideCatAssistLines(
      LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS,
      t,
    ), {
      scopeKey: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
      seed: options.seed,
    }),
    entryChips: [],
  });
}

export function resolveDraftStarterSuggestionsBaseline(input: {
  mode: GuideCatAssistNewChatMode;
  defaultRecipientName?: string | null;
  t?: GuideCatAssistTranslator;
}): GuideCatAssistContent['entryChips'] {
  const t = input.t ?? defaultGuideCatAssistTranslator;
  const fallbackCatName = t(messageKeys.sharedSettingsCatsFallbackCatName);
  switch (input.mode) {
    case 'direct':
      return [
        {
          id: 'direct-update',
          prompt: withCatName(
            t(messageKeys.chatNewChatDraftAssistDirectUpdatePrompt),
            input.defaultRecipientName,
            fallbackCatName,
          ),
        },
        {
          id: 'direct-next-step',
          prompt: withCatName(
            t(messageKeys.chatNewChatDraftAssistDirectNextStepPrompt),
            input.defaultRecipientName,
            fallbackCatName,
          ),
        },
        {
          id: 'direct-iterate',
          prompt: withCatName(
            t(messageKeys.chatNewChatDraftAssistDirectIteratePrompt),
            input.defaultRecipientName,
            fallbackCatName,
          ),
        },
      ];
    case 'participant':
      return [
        {
          id: 'participant-first-pass',
          prompt: withCatName(
            t(messageKeys.chatNewChatDraftAssistParticipantFirstPassPrompt),
            input.defaultRecipientName,
            fallbackCatName,
          ),
        },
        {
          id: 'participant-review',
          prompt: withCatName(
            t(messageKeys.chatNewChatDraftAssistParticipantReviewPrompt),
            input.defaultRecipientName,
            fallbackCatName,
          ),
        },
        {
          id: 'participant-brief',
          prompt: withCatName(
            t(messageKeys.chatNewChatDraftAssistParticipantBriefPrompt),
            input.defaultRecipientName,
            fallbackCatName,
          ),
        },
      ];
    case 'group':
      return [
        {
          id: 'group-roles',
          prompt: t(messageKeys.chatNewChatDraftAssistGroupRolesPrompt),
        },
        {
          id: 'group-compare',
          prompt: t(messageKeys.chatNewChatDraftAssistGroupComparePrompt),
        },
        {
          id: 'group-next-steps',
          prompt: t(messageKeys.chatNewChatDraftAssistGroupNextStepsPrompt),
        },
      ];
    case 'parallel':
      return [
        {
          id: 'parallel-compare',
          prompt: t(messageKeys.chatNewChatDraftAssistParallelComparePrompt),
        },
        {
          id: 'parallel-options',
          prompt: t(messageKeys.chatNewChatDraftAssistParallelOptionsPrompt),
        },
        {
          id: 'parallel-tradeoffs',
          prompt: t(messageKeys.chatNewChatDraftAssistParallelTradeoffsPrompt),
        },
      ];
    case 'solo':
    default:
      return [
        {
          id: 'solo-plan',
          prompt: t(messageKeys.chatNewChatDraftAssistSoloPlanPrompt),
        },
        {
          id: 'solo-draft',
          prompt: t(messageKeys.chatNewChatDraftAssistSoloDraftPrompt),
        },
        {
          id: 'solo-decide',
          prompt: t(messageKeys.chatNewChatDraftAssistSoloDecidePrompt),
        },
      ];
  }
}

export function resolveNewChatGuideCatAssistBaseline(input: {
  mode: GuideCatAssistNewChatMode;
  defaultRecipientName?: string | null;
  seed?: string | null;
  t?: GuideCatAssistTranslator;
}): GuideCatAssistBundle {
  const t = input.t ?? defaultGuideCatAssistTranslator;
  const scope: GuideCatAssistScope = {
    surfaceId: 'chat:new',
    surfaceMode: input.mode,
    audienceState: 'default',
  };
  const scopeKey = GUIDE_CAT_ASSIST_V1_CHAT_NEW_SCOPE_KEYS_BY_MODE[input.mode];
  return createDeterministicBaselineBundle(scope, {
    greeting: selectDeterministicLine(translateGuideCatAssistLines(
      CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
      t,
    ), {
      scopeKey,
      seed: input.seed,
    }),
    entryChips: resolveDraftStarterSuggestionsBaseline({
      mode: input.mode,
      defaultRecipientName: input.defaultRecipientName,
      t,
    }),
  });
}

export function resolveNewCodeGuideCatAssistBaseline(options: {
  seed?: string | null;
  t?: GuideCatAssistTranslator;
} = {}): GuideCatAssistBundle {
  const t = options.t ?? defaultGuideCatAssistTranslator;
  const scope: GuideCatAssistScope = {
    surfaceId: 'code:new',
    surfaceMode: 'default',
    audienceState: 'default',
  };
  return createDeterministicBaselineBundle(scope, {
    greeting: selectDeterministicLine(translateGuideCatAssistLines(
      CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
      t,
    ), {
      scopeKey: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.codeNewDefault,
      seed: options.seed,
    }),
    entryChips: [
      {
        id: 'code-pomodoro',
        label: t(messageKeys.codeNewDraftStarterPomodoroLabel),
        prompt: t(messageKeys.codeNewDraftStarterPomodoroPrompt),
      },
      {
        id: 'code-fix-bug',
        label: t(messageKeys.codeNewDraftStarterFixBugLabel),
        prompt: t(messageKeys.codeNewDraftStarterFixBugPrompt),
      },
      {
        id: 'code-refactor',
        label: t(messageKeys.codeNewDraftStarterRefactorLabel),
        prompt: t(messageKeys.codeNewDraftStarterRefactorPrompt),
      },
      {
        id: 'code-write-tests',
        label: t(messageKeys.codeNewDraftStarterWriteTestsLabel),
        prompt: t(messageKeys.codeNewDraftStarterWriteTestsPrompt),
      },
      // Cross-surface chip: the Code renderer (`products/code/renderer/
      // components/NewChatDraft.tsx`) routes IDs prefixed with
      // `cross:work:` to `onDraftSurfaceChange('work')` + prefetch.
      {
        id: 'cross:work:start-project',
        label: t(messageKeys.codeNewDraftStarterStartProjectLabel),
        prompt: t(messageKeys.codeNewDraftStarterStartProjectPrompt),
      },
    ],
  });
}
