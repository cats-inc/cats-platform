import type { MessageKey } from './i18n/messageKeys.js';
import type { GuideCatAssistProduct } from './guideCatAssist.js';

export const LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS = [
  'lobby.greeting.chooseSurface',
  'lobby.greeting.homeReady',
  'lobby.greeting.pickProduct',
  'lobby.greeting.everythingStaged',
  'lobby.greeting.openSurface',
  'lobby.greeting.awake',
  'lobby.greeting.continue',
] as const satisfies ReadonlyArray<MessageKey>;

export const CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS = [
  'chat.newChatDraft.defaultGreeting',
  'chat.newChatDraft.greeting.nap',
  'chat.newChatDraft.greeting.keyboard',
  'chat.newChatDraft.greeting.letsGo',
  'chat.newChatDraft.greeting.standby',
  'chat.newChatDraft.greeting.taskReady',
  'chat.newChatDraft.greeting.onDuty',
] as const satisfies ReadonlyArray<MessageKey>;

export const CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS = [
  'code.newDraft.greeting',
  'code.newDraft.greeting.openRepo',
  'code.newDraft.greeting.buildFixRefactor',
  'code.newDraft.greeting.shipImprovement',
  'code.newDraft.greeting.smallestChange',
] as const satisfies ReadonlyArray<MessageKey>;

export const WORK_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS = [
  'workNewDraftGreeting',
  'workNewDraftGreetingPriorities',
  'workNewDraftGreetingNextStep',
] as const satisfies ReadonlyArray<MessageKey>;

export interface GuideCatCatalogGreeting {
  id: string;
  origin: 'builtin' | 'catlas';
  enabled: boolean;
  messageKey?: MessageKey;
  text?: string;
  locale?: string;
}
export interface GuideCatCatalogChip {
  id: string;
  origin: 'builtin' | 'catlas';
  enabled: boolean;
  surface: GuideCatAssistProduct;
  labelKey?: MessageKey;
  promptKey?: MessageKey;
  label?: string;
  prompt?: string;
  locale?: string;
}
export interface GuideCatCatalog {
  greetings: GuideCatCatalogGreeting[];
  chips: GuideCatCatalogChip[];
}
const greetingKeys = {
  lobby: LOBBY_GUIDE_CAT_ASSIST_GREETING_KEYS,
  'chat:new': CHAT_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
  'code:new': CODE_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
  'work:new': WORK_NEW_GUIDE_CAT_ASSIST_GREETING_KEYS,
};
const chipDefinitions: Record<string, Array<[string, GuideCatAssistProduct, MessageKey, MessageKey]>> = {
  'chat:new': [
    ['plan-my-day', 'chat', 'chat.newChatDraft.planMyDayChipLabel', 'chat.newChatDraft.planMyDayPrompt'],
    ['brainstorm-name', 'chat', 'chat.newChatDraft.brainstormNameChipLabel', 'chat.newChatDraft.brainstormNamePrompt'],
    ['summarize-link', 'chat', 'chat.newChatDraft.summarizeLinkChipLabel', 'chat.newChatDraft.summarizeLinkPrompt'],
    ['pomodoro-app', 'code', 'chat.newChatDraft.pomodoroChipLabel', 'chat.newChatDraft.pomodoroPrompt'],
    ['start-project', 'work', 'chat.newChatDraft.startProjectChipLabel', 'chat.newChatDraft.startProjectPrompt'],
  ],
  'code:new': [
    ['code-pomodoro', 'code', 'code.newDraft.starter.pomodoro.label', 'code.newDraft.starter.pomodoro.prompt'],
    ['code-fix-bug', 'code', 'code.newDraft.starter.fixBug.label', 'code.newDraft.starter.fixBug.prompt'],
    ['code-refactor', 'code', 'code.newDraft.starter.refactor.label', 'code.newDraft.starter.refactor.prompt'],
    ['code-write-tests', 'code', 'code.newDraft.starter.writeTests.label', 'code.newDraft.starter.writeTests.prompt'],
    ['code-start-project', 'work', 'code.newDraft.starter.startProject.label', 'code.newDraft.starter.startProject.prompt'],
  ],
  'work:new': [
    ['work-start-project', 'work', 'work.newChatDraft.startProjectChipLabel', 'work.newChatDraft.startProjectPrompt'],
    ['work-add-task', 'work', 'work.newChatDraft.addTaskChipLabel', 'work.newChatDraft.addTaskPrompt'],
    ['work-plan-sprint', 'work', 'work.newChatDraft.planSprintChipLabel', 'work.newChatDraft.planSprintPrompt'],
    ['work-schedule-review', 'work', 'work.newChatDraft.scheduleReviewChipLabel', 'work.newChatDraft.scheduleReviewPrompt'],
    ['work-triage-backlog', 'work', 'work.newChatDraft.triageBacklogChipLabel', 'work.newChatDraft.triageBacklogPrompt'],
  ],
};
export function createBuiltinGuideCatCatalog(surfaceId: string): GuideCatCatalog {
  const keys = greetingKeys[surfaceId as keyof typeof greetingKeys] ?? [];
  return {
    greetings: keys.map((messageKey, index) => ({
      id: `builtin:${surfaceId}:greeting:${index}`, origin: 'builtin', enabled: true, messageKey,
    })),
    chips: (chipDefinitions[surfaceId] ?? []).map(([id, surface, labelKey, promptKey]) => ({
      id, surface, labelKey, promptKey, enabled: true, origin: 'builtin',
    })),
  };
}
