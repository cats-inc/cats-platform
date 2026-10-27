import type { GuideCatAssistSurfaceReadModel } from './guideCatAssist.js';
import {
  createTranslator,
  type MessageInterpolationValues,
  type MessageKey,
} from './i18n/index.js';

export type GuideCatAssistTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultGuideCatAssistTranslator = createTranslator('en');

export {
  LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS, CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
  CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS, WORK_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
} from './guideCatAssistCatalog.js';

export function translateGuideCatAssistLines(
  keys: ReadonlyArray<MessageKey>,
  t: GuideCatAssistTranslator = defaultGuideCatAssistTranslator,
): string[] {
  return keys.map((key) => t(key));
}

export function resolveGuideCatAssistGreeting(
  assist: GuideCatAssistSurfaceReadModel | null | undefined,
  t: GuideCatAssistTranslator = defaultGuideCatAssistTranslator,
  pick: number = Math.random(),
): string | null {
  const pool = assist?.bundle.content.greetings ?? [];
  const item = pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
  return item ? item.messageKey ? t(item.messageKey as MessageKey) : item.text : null;
}
