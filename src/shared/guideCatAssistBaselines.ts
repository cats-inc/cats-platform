import { createTranslator } from './i18n/index.js';
import { createGuideCatAssistScopeKey, type GuideCatAssistBundle } from './guideCatAssist.js';
import { createBuiltinGuideCatCatalog } from './guideCatAssistCatalog.js';

export function resolveGuideCatAssistBaseline(surfaceId: string): GuideCatAssistBundle {
  const scope = { surfaceId, surfaceMode: 'default', audienceState: 'default' };
  const catalog = createBuiltinGuideCatCatalog(surfaceId);
  const t = createTranslator('en');
  return {
    bundleId: createGuideCatAssistScopeKey(scope), scope,
    content: {
      greetings: catalog.greetings.map(item => ({
        id: item.id, text: t(item.messageKey!), messageKey: item.messageKey,
      })),
      entryChips: catalog.chips.map(item => ({
        id: item.id, action: 'prefill', surface: item.surface,
        label: t(item.labelKey!), prompt: t(item.promptKey!),
        labelKey: item.labelKey, promptKey: item.promptKey,
      })),
    },
    provenance: { originMode: 'deterministic', refreshContextHash: 'gca:v2:baseline' },
    freshness: { generatedAt: new Date(0).toISOString(), expiresAt: null, lastRefreshStatus: 'never' },
  };
}
export const resolveLobbyGuideCatAssistBaseline = () => resolveGuideCatAssistBaseline('lobby');
export const resolveNewChatGuideCatAssistBaseline = () => resolveGuideCatAssistBaseline('chat:new');
export const resolveNewCodeGuideCatAssistBaseline = () => resolveGuideCatAssistBaseline('code:new');
