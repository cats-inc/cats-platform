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
  GUIDE_CAT_ASSIST_V1_SCOPE_KEYS,
  createGuideCatAssistBundleId,
  type GuideCatAssistBundle,
  type GuideCatAssistContent,
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

/**
 * The +New chat surface is a single deterministic baseline. Composer
 * mode (solo / group / parallel) is renderer state, not a guide-cat-assist
 * scope axis, so the baseline does not switch on it. The renderer ignores
 * deterministic-origin chips today (only runtime-origin chips render —
 * see `chatNewChatDraftSupport.ts`'s `resolvePayloadDraftAssist`), so the
 * baseline ships an empty `entryChips` array; the cached bundle still
 * carries a stable greeting for offline / first-paint use.
 */
export function resolveNewChatGuideCatAssistBaseline(input: {
  seed?: string | null;
  t?: GuideCatAssistTranslator;
} = {}): GuideCatAssistBundle {
  const t = input.t ?? defaultGuideCatAssistTranslator;
  const scope: GuideCatAssistScope = {
    surfaceId: 'chat:new',
    surfaceMode: 'default',
    audienceState: 'default',
  };
  return createDeterministicBaselineBundle(scope, {
    greeting: selectDeterministicLine(translateGuideCatAssistLines(
      CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
      t,
    ), {
      scopeKey: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewDefault,
      seed: input.seed,
    }),
    entryChips: [],
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
