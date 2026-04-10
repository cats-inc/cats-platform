import type {
  AppShellPayload,
  ChatChannelView,
  ChatCat,
  ChatChannelSummary,
  CreateChatChannelInput,
  CreateTemporaryParticipantInput,
  NewChatEntryKind,
} from '../api/contracts';
import type { NewChatMode } from '../shared/channelPaths.js';
import type { AssistantPresetRecord } from '../../../core/types.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { buildExecutionLabel } from '../../../shared/executionLabel.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../shared/platformSurfaces.js';
import {
  PRODUCT_PROVIDER_ORDER,
  getDefaultModel,
  getDefaultProviderInstance,
  getDefaultProviderBackend,
} from '../../../shared/providerCatalog.js';
import {
  normalizeSelectedChannelView,
  type SelectedChannelView,
} from '../shared/channelEntry';
import {
  emptyCatForm as emptyWorkspaceCatForm,
  isChatCat as isWorkspaceChatCat,
  executionLabel as resolveWorkspaceExecutionLabel,
  compareChatCatsForDisplay as compareWorkspaceChatCatsForDisplay,
  sortChatCatsForDisplay as sortWorkspaceChatCatsForDisplay,
  resolveTranscriptMessageSpeaker as resolveWorkspaceTranscriptMessageSpeaker,
  createDraftChannelTitle as createWorkspaceDraftChannelTitle,
  createDraftChannelTopic as createWorkspaceDraftChannelTopic,
  buildAttachedFilesMessageBody as buildWorkspaceAttachedFilesMessageBody,
  buildNewChatChannelInput as buildWorkspaceNewChatChannelInput,
  applyOptimisticPendingExecutionTarget as applyWorkspaceOptimisticPendingExecutionTarget,
  insertCreatedChannelIntoPayload as insertWorkspaceCreatedChannelIntoPayload,
  messageTone as resolveWorkspaceMessageTone,
  presentChannelTitle as presentWorkspaceChannelTitle,
  truncatePath as truncateWorkspacePath,
  resolveBossCatName as resolveWorkspaceBossCatName,
} from '../../shared/renderer/workspaceChatUtils.js';
import {
  activeAssignedParticipants,
  resolveAssignedParticipants,
} from '../shared/channelParticipants';
import {
  buildAutoTemporaryParticipantName,
  resolveTemporaryParticipantName,
} from '../shared/participantNaming';

export type Surface = 'chats' | 'settings';

export interface CatFormState {
  name: string;
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
  makeBoss: boolean;
  products: string[];
}

export interface DraftTemporaryParticipant extends CreateTemporaryParticipantInput {
  participantId: string;
  presetId?: string | null;
}

export const DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT = 2;

export function createInitialGroupParticipants(
  baseProvider: string,
  maxParticipants: number = DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT,
): DraftTemporaryParticipant[] {
  const cappedMaxParticipants = Number.isFinite(maxParticipants)
    ? Math.max(0, maxParticipants)
    : DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT;
  const targetCount = Math.min(DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT, cappedMaxParticipants);
  const providerSet = new Set([
    baseProvider,
    ...PRODUCT_PROVIDER_ORDER.filter((provider) => provider !== baseProvider),
  ]);
  const providerSequence = [...providerSet]
    .sort((a, b) => {
      const ai = (PRODUCT_PROVIDER_ORDER as readonly string[]).indexOf(a);
      const bi = (PRODUCT_PROVIDER_ORDER as readonly string[]).indexOf(b);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    })
    .slice(0, targetCount);

  const takenNames: string[] = [];
  return providerSequence.map((provider) => {
    const backend = getDefaultProviderBackend(provider);
    const name = buildAutoTemporaryParticipantName(provider, takenNames, backend);
    takenNames.push(name);
    return {
      participantId: globalThis.crypto?.randomUUID?.() ?? `temp-${provider}-${Date.now()}`,
      name,
      provider,
      instance: getDefaultProviderInstance(provider) ?? undefined,
      model: getDefaultModel(provider) || undefined,
      modelSelection: null,
    };
  });
}

export function resolveGenericDraftTemporaryParticipants(
  mode: NewChatMode,
  existingParticipants: DraftTemporaryParticipant[],
  createGroupParticipants: () => DraftTemporaryParticipant[],
): DraftTemporaryParticipant[] {
  if (mode !== 'group') {
    return [];
  }

  return existingParticipants.length > 0
    ? existingParticipants
    : createGroupParticipants();
}

export function emptyCatForm(): CatFormState {
  return emptyWorkspaceCatForm();
}

export function isChatCat(cat: ChatCat): boolean {
  return isWorkspaceChatCat(cat);
}

export function executionLabel(cat: ChatCat): string {
  return resolveWorkspaceExecutionLabel(cat);
}

export interface SortChatCatsOptions {
  bossCatIds?: string | string[] | null;
  archivedLast?: boolean;
}

export function compareChatCatsForDisplay(
  left: ChatCat,
  right: ChatCat,
  options: SortChatCatsOptions = {},
): number {
  return compareWorkspaceChatCatsForDisplay(left, right, options);
}

export function sortChatCatsForDisplay(
  cats: ChatCat[],
  options: SortChatCatsOptions = {},
): ChatCat[] {
  return sortWorkspaceChatCatsForDisplay(cats, options);
}

export interface TranscriptMessageSpeaker {
  kind: 'none' | 'cat' | 'provider' | 'deleted_cat' | 'name';
  label: string | null;
  cat: ChatCat | null;
}

export function resolveTranscriptMessageSpeaker(
  message: AppShellPayload['chat']['selectedChannel'] extends infer TChannel
    ? TChannel extends { messages: ReadonlyArray<infer TMessage> } ? TMessage : never
    : never,
  cats: ChatCat[],
): TranscriptMessageSpeaker {
  return resolveWorkspaceTranscriptMessageSpeaker(message, cats);
}

export function createDraftChannelTitle(body: string, existingCount: number): string {
  return createWorkspaceDraftChannelTitle(body, existingCount);
}

export function createDraftChannelTopic(body: string): string {
  return createWorkspaceDraftChannelTopic(body);
}

export function buildAttachedFilesMessageBody(
  body: string,
  attachments: Array<{ relativePath: string }>,
): string {
  return buildWorkspaceAttachedFilesMessageBody(body, attachments);
}

export function buildNewChatChannelInput(options: {
  body: string;
  existingCount: number;
  entryKind?: NewChatEntryKind;
  repoPath?: string | null;
  defaultRecipientCatId?: string | null;
  participantCatIds?: string[];
  temporaryParticipants?: DraftTemporaryParticipant[];
  draftModel?: {
    provider: string;
    model: string | null;
    instance: string | null;
    modelSelection?: ProviderModelSelection | null;
  };
}): CreateChatChannelInput {
  return buildWorkspaceNewChatChannelInput(options);
}

export function messageEntryTone(senderKind: string): string {
  switch (senderKind) {
    case 'user':
      return 'transcriptEntry transcriptEntryUser';
    case 'system':
      return 'transcriptEntry transcriptEntrySystem';
    default:
      return 'transcriptEntry transcriptEntryAgent';
  }
}

export function messageTone(senderKind: string): string {
  return resolveWorkspaceMessageTone(senderKind);
}

export function presentChannelTitle(title: string): string {
  return presentWorkspaceChannelTitle(title);
}

export { nameInitials as catInitials } from '../../../shared/nameInitials.js';

export function truncatePath(fullPath: string, maxLen = 20): string {
  return truncateWorkspacePath(fullPath, maxLen);
}

export function buildDraftParticipantExecutionLabel(participant: {
  provider: string;
  instance?: string | null;
  model?: string | null;
}): string {
  return buildExecutionLabel(
    participant.provider,
    participant.instance ?? null,
    participant.model ?? null,
  );
}

export function resolveDraftAudienceParticipantIds(options: {
  draftParticipantCatIds: readonly string[];
  draftTemporaryParticipants: ReadonlyArray<Pick<DraftTemporaryParticipant, 'participantId'>>;
  draftAudienceKeys?: readonly string[] | null;
}): string[] {
  const allParticipants = [
    ...options.draftParticipantCatIds.map((catId) => ({
      key: `cat:${catId}`,
      participantId: catId,
    })),
    ...options.draftTemporaryParticipants.map((participant) => ({
      key: `temp:${participant.participantId}`,
      participantId: participant.participantId,
    })),
  ];
  if (!options.draftAudienceKeys) {
    return allParticipants.map((participant) => participant.participantId);
  }

  const participantIdsByKey = new Map(
    allParticipants.map((participant) => [participant.key, participant.participantId]),
  );
  const resolvedAudience = options.draftAudienceKeys
    .map((key) => participantIdsByKey.get(key))
    .filter((participantId): participantId is string => Boolean(participantId))
    .filter((participantId, index, list) => list.indexOf(participantId) === index);

  if (resolvedAudience.length > 0) {
    return resolvedAudience;
  }

  return allParticipants[0]?.participantId ? [allParticipants[0].participantId] : [];
}

export function createDraftTemporaryParticipantFromAssistantPreset(
  assistantPreset: AssistantPresetRecord,
  options: {
    participantId?: string | null;
    randomUUID?: () => string;
  } = {},
): DraftTemporaryParticipant {
  return {
    participantId:
      options.participantId?.trim()
      || options.randomUUID?.()
      || globalThis.crypto.randomUUID(),
    presetId: assistantPreset.id,
    name: assistantPreset.name,
    provider: assistantPreset.executionTarget.provider,
    instance: assistantPreset.executionTarget.instance ?? undefined,
    model: assistantPreset.executionTarget.model ?? undefined,
    modelSelection: assistantPreset.modelSelection ?? null,
    roleHint: assistantPreset.roleHint ?? undefined,
  };
}

export function createDraftTemporaryParticipant(options: {
  participantId?: string | null;
  name?: string | null;
  provider: string;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
  roleHint?: string | null;
  presetId?: string | null;
  takenNames?: ReadonlyArray<string>;
  randomUUID?: () => string;
}): DraftTemporaryParticipant {
  const participantId =
    options.participantId?.trim()
    || options.randomUUID?.()
    || globalThis.crypto?.randomUUID?.()
    || `participant-${Date.now()}`;

  return {
    participantId,
    presetId: options.presetId?.trim() || undefined,
    name: resolveTemporaryParticipantName(
      {
        name: options.name,
        provider: options.provider,
      },
      options.takenNames,
    ),
    provider: options.provider.trim(),
    instance: options.instance?.trim() || undefined,
    model: options.model?.trim() || undefined,
    modelSelection: options.modelSelection ?? null,
    roleHint: options.roleHint?.trim() || undefined,
  };
}

export function draftHasAssistantPresetParticipant(
  draftTemporaryParticipants: readonly DraftTemporaryParticipant[],
  assistantPresetId: string,
): boolean {
  return draftTemporaryParticipants.some((participant) => participant.presetId === assistantPresetId);
}

export const GREETING_LINES = [
  "Meow. Ready when you are.",
  "Your cat hasn't napped yet.",
  "Cats on the keyboard.",
  "Tail up, let's go.",
  "Purring in standby.",
  "Claws sharpened. What's the task?",
  "This cat doesn't sleep on the job.",
];

export const DRAFT_GREETING_LINES = GREETING_LINES;

function normalizeGreetingPool(pool: ReadonlyArray<string> | null | undefined): string[] {
  return (pool ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function pickGreeting(
  pool: ReadonlyArray<string> = DRAFT_GREETING_LINES,
  random: () => number = Math.random,
): string {
  const normalizedPool = normalizeGreetingPool(pool);
  const fallbackPool = normalizeGreetingPool(DRAFT_GREETING_LINES);
  const activePool = normalizedPool.length > 0 ? normalizedPool : fallbackPool;
  return activePool[Math.floor(random() * activePool.length)];
}

export function pickDraftGreeting(
  options: {
    pool?: ReadonlyArray<string> | null;
    random?: () => number;
  } = {},
): string {
  return pickGreeting(
    normalizeGreetingPool(options.pool).length > 0
      ? options.pool ?? DRAFT_GREETING_LINES
      : DRAFT_GREETING_LINES,
    options.random,
  );
}

export function resolveBossCatName(payload: AppShellPayload): string | null {
  return resolveWorkspaceBossCatName(payload);
}

export type { SelectedChannelView } from '../shared/channelEntry';

export function applyPendingExecutionTargetPreview(
  payload: AppShellPayload,
  channelId: string,
  target: {
    pendingProvider: string | null;
    pendingModel: string | null;
    pendingInstance: string | null;
    pendingModelSelection: ProviderModelSelection | null;
  },
): AppShellPayload {
  return applyWorkspaceOptimisticPendingExecutionTarget(payload, channelId, target);
}

export function insertCreatedChannelIntoPayload(
  payload: AppShellPayload,
  createdChannel: ChatChannelView,
): AppShellPayload {
  return insertWorkspaceCreatedChannelIntoPayload(payload, createdChannel);
}

export function BootShell() {
  return (
    <div className="screen bootShell" aria-label="Loading Cats Chat">
      <div className="bootSpinner" aria-hidden="true" />
    </div>
  );
}
