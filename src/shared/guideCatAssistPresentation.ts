import type { GuideCatAssistSurfaceReadModel } from './guideCatAssist.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from './i18n/index.js';

export type GuideCatAssistTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultGuideCatAssistTranslator = createTranslator('en');

export const LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS = [
  messageKeys.lobbyGreetingChooseSurface,
  messageKeys.lobbyGreetingHomeReady,
  messageKeys.lobbyGreetingPickProduct,
  messageKeys.lobbyGreetingEverythingStaged,
  messageKeys.lobbyGreetingOpenSurface,
  messageKeys.lobbyGreetingAwake,
  messageKeys.lobbyGreetingContinue,
] as const;

export const CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS = [
  messageKeys.chatNewChatDraftDefaultGreeting,
  messageKeys.chatNewChatDraftGreetingNap,
  messageKeys.chatNewChatDraftGreetingKeyboard,
  messageKeys.chatNewChatDraftGreetingLetsGo,
  messageKeys.chatNewChatDraftGreetingStandby,
  messageKeys.chatNewChatDraftGreetingTaskReady,
  messageKeys.chatNewChatDraftGreetingOnDuty,
] as const;

export const CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS = [
  messageKeys.codeNewDraftGreeting,
  messageKeys.codeNewDraftGreetingOpenRepo,
  messageKeys.codeNewDraftGreetingBuildFixRefactor,
  messageKeys.codeNewDraftGreetingShipImprovement,
  messageKeys.codeNewDraftGreetingSmallestChange,
] as const;

export function translateGuideCatAssistLines(
  keys: ReadonlyArray<MessageKey>,
  t: GuideCatAssistTranslator = defaultGuideCatAssistTranslator,
): string[] {
  return keys.map((key) => t(key));
}

function resolveDeterministicGreetingKeys(
  assist: GuideCatAssistSurfaceReadModel,
): ReadonlyArray<MessageKey> | null {
  switch (assist.bundle.scope.surfaceId) {
    case 'lobby':
      return LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS;
    case 'chat:new':
      return CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS;
    case 'code:new':
      return CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS;
    default:
      return null;
  }
}

export function resolveGuideCatAssistGreeting(
  assist: GuideCatAssistSurfaceReadModel | null | undefined,
  t: GuideCatAssistTranslator = defaultGuideCatAssistTranslator,
): string | null {
  if (!assist) {
    return null;
  }

  const greeting = assist.bundle.content.greeting?.trim();
  if (!greeting) {
    return null;
  }

  if (assist.bundle.provenance.originMode !== 'deterministic') {
    return greeting;
  }

  const keys = resolveDeterministicGreetingKeys(assist);
  if (!keys) {
    return greeting;
  }

  const englishLines = translateGuideCatAssistLines(keys, defaultGuideCatAssistTranslator);
  const greetingIndex = englishLines.findIndex((line) => line === greeting);
  if (greetingIndex < 0) {
    return greeting;
  }

  const key = keys[greetingIndex];
  return key ? t(key) : greeting;
}
