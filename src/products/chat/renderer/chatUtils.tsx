import type {
  AppShellPayload,
  ChatChannelView,
  ChatCat,
  ChatChannelSummary,
  ChatMessage,
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
} from '../../../shared/providerCatalog.js';
import {
  normalizeSelectedChannelView,
  type SelectedChannelView,
} from '../shared/channelEntry';
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
  const providerSequence = [
    baseProvider,
    ...PRODUCT_PROVIDER_ORDER.filter((provider) => provider !== baseProvider),
  ].slice(0, targetCount);

  const takenNames: string[] = [];
  return providerSequence.map((provider) => {
    const name = buildAutoTemporaryParticipantName(provider, takenNames);
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
  return {
    name: '',
    provider: 'claude',
    instance: '',
    model: '',
    modelSelection: null,
    makeBoss: false,
    products: defaultCatProducts(),
  };
}

export function isChatCat(cat: ChatCat): boolean {
  return hasPlatformSurface(cat.products, 'chat', {
    fallback: defaultCatProducts(),
  });
}

export function executionLabel(cat: ChatCat): string {
  return buildExecutionLabel(
    cat.defaultExecutionTarget.provider,
    cat.defaultExecutionTarget.instance,
    cat.defaultExecutionTarget.model,
  );
}

function normalizePinnedCatIds(
  bossCatIds: string | string[] | null | undefined,
): Set<string> {
  if (Array.isArray(bossCatIds)) {
    return new Set(bossCatIds.filter((value): value is string => Boolean(value)));
  }
  return bossCatIds ? new Set([bossCatIds]) : new Set<string>();
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
  const pinnedCatIds = normalizePinnedCatIds(options.bossCatIds);
  if (options.archivedLast) {
    const leftArchived = left.status === 'archived' ? 1 : 0;
    const rightArchived = right.status === 'archived' ? 1 : 0;
    if (leftArchived !== rightArchived) {
      return leftArchived - rightArchived;
    }
  }

  const leftPinned = pinnedCatIds.has(left.id) ? 0 : 1;
  const rightPinned = pinnedCatIds.has(right.id) ? 0 : 1;
  if (leftPinned !== rightPinned) {
    return leftPinned - rightPinned;
  }

  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return left.id.localeCompare(right.id);
}

export function sortChatCatsForDisplay(
  cats: ChatCat[],
  options: SortChatCatsOptions = {},
): ChatCat[] {
  return [...cats].sort((left, right) => compareChatCatsForDisplay(left, right, options));
}

export interface TranscriptMessageSpeaker {
  kind: 'none' | 'cat' | 'provider' | 'deleted_cat' | 'name';
  label: string | null;
  cat: ChatCat | null;
}

function readExecutionLabelSnapshot(message: ChatMessage): string | null {
  const snapshot = message.metadata?.executionLabelSnapshot;
  return typeof snapshot === 'string' && snapshot.trim() ? snapshot.trim() : null;
}

export function resolveTranscriptMessageSpeaker(
  message: ChatMessage,
  cats: ChatCat[],
): TranscriptMessageSpeaker {
  if (message.senderKind === 'user' || message.senderKind === 'system') {
    return { kind: 'none', label: null, cat: null };
  }

  const targetKind = message.metadata?.targetKind === 'cat' || message.metadata?.targetKind === 'orchestrator'
    ? message.metadata.targetKind
    : null;
  const targetId = typeof message.metadata?.targetId === 'string' && message.metadata.targetId
    ? message.metadata.targetId
    : null;

  if (targetKind === 'cat' && targetId) {
    const liveCat = cats.find((cat) => cat.id === targetId) ?? null;
    if (liveCat) {
      return {
        kind: 'cat',
        label: liveCat.name,
        cat: liveCat,
      };
    }
    return {
      kind: 'deleted_cat',
      label: 'Deleted Cat',
      cat: null,
    };
  }

  const fallbackCat = message.senderName && message.senderName !== 'Orchestrator'
    ? cats.find((cat) => cat.name === message.senderName) ?? null
    : null;
  if (fallbackCat) {
    return {
      kind: 'cat',
      label: fallbackCat.name,
      cat: fallbackCat,
    };
  }

  if (
    message.executionProvider
    && (targetKind === 'orchestrator' || message.senderName === 'Orchestrator')
  ) {
    return {
      kind: 'provider',
      label: readExecutionLabelSnapshot(message)
        ?? buildExecutionLabel(
          message.executionProvider,
          message.executionInstance,
          null,
        ),
      cat: null,
    };
  }

  if (message.senderName !== 'Orchestrator') {
    return {
      kind: 'name',
      label: message.senderName,
      cat: null,
    };
  }

  return { kind: 'none', label: null, cat: null };
}

export function createDraftChannelTitle(body: string, existingCount: number): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return existingCount > 0 ? `New chat ${existingCount + 1}` : 'New chat';
  }

  return normalized.slice(0, 48);
}

export function createDraftChannelTopic(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 120);
}

export function buildAttachedFilesMessageBody(
  body: string,
  attachments: Array<{ relativePath: string }>,
): string {
  if (attachments.length === 0) {
    return body;
  }

  const refs = attachments.map((attachment) => `- ${attachment.relativePath}`).join('\n');
  return `[Attached files in working directory:]\n${refs}\n\n${body}`;
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
  const {
    body,
    existingCount,
    entryKind,
    repoPath,
    defaultRecipientCatId,
    participantCatIds = [],
    temporaryParticipants = [],
    draftModel,
  } = options;
  const normalizedLeadCatId = defaultRecipientCatId?.trim() || null;
  const normalizedParticipantCatIds = participantCatIds.filter((id) => id !== normalizedLeadCatId);
  const resolvedEntryKind = entryKind
    ?? (normalizedLeadCatId || normalizedParticipantCatIds.length > 0 ? 'group' : 'solo');
  const directLeadCatId = normalizedLeadCatId ?? normalizedParticipantCatIds[0] ?? null;
  const baseInput: CreateChatChannelInput = {
    title: createDraftChannelTitle(body, existingCount),
    topic: createDraftChannelTopic(body),
    entryKind: resolvedEntryKind,
    skipBossCatGreeting: true,
    repoPath: repoPath ?? undefined,
    temporaryParticipants: temporaryParticipants.length > 0
      ? temporaryParticipants.map((participant) => ({
          participantId: participant.participantId,
          name: participant.name,
          provider: participant.provider,
          instance: participant.instance ?? undefined,
          model: participant.model ?? undefined,
          modelSelection: participant.modelSelection ?? null,
          roleHint: participant.roleHint ?? undefined,
        }))
      : undefined,
  };

  if (resolvedEntryKind === 'direct' && directLeadCatId) {
    return {
      ...baseInput,
      roomMode: 'direct_cat_chat',
      defaultRecipientId: directLeadCatId,
      participantCatIds: [directLeadCatId, ...normalizedParticipantCatIds.filter((id) => id !== directLeadCatId)],
    };
  }

  if (normalizedLeadCatId) {
    return {
      ...baseInput,
      defaultRecipientId: normalizedLeadCatId,
      participantCatIds: [normalizedLeadCatId, ...normalizedParticipantCatIds],
    };
  }

  if (normalizedParticipantCatIds.length > 0) {
    return {
      ...baseInput,
      participantCatIds: normalizedParticipantCatIds,
    };
  }

  return {
    ...baseInput,
    composerMode: 'solo',
    pendingProvider: draftModel?.provider,
    pendingModel: draftModel?.model ?? undefined,
    pendingInstance: draftModel?.instance ?? undefined,
    pendingModelSelection: draftModel?.modelSelection ?? undefined,
  };
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
  switch (senderKind) {
    case 'user':
      return 'transcriptMessage transcriptMessageUser';
    case 'orchestrator':
      return 'transcriptMessage transcriptMessageOrchestrator';
    case 'agent':
      return 'transcriptMessage transcriptMessageAgent';
    default:
      return 'transcriptMessage transcriptMessageSystem';
  }
}

export function presentChannelTitle(title: string): string {
  return title.trim() === 'Untitled chat' ? 'New chat' : title;
}

export { nameInitials as catInitials } from '../../../shared/nameInitials.js';

export function truncatePath(fullPath: string, maxLen = 20): string {
  const name = fullPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? fullPath;
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 3) + '...';
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
  if (!payload.chat.bossCatId) {
    return null;
  }

  return payload.chat.cats.find((cat) => cat.id === payload.chat.bossCatId)?.name ?? null;
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
  const next = structuredClone(payload);
  const selectedChannel = next.chat.selectedChannel;
  const channelSummary = next.chat.channels.find((channel) => channel.id === channelId);

  if (!selectedChannel || selectedChannel.id !== channelId || !channelSummary) {
    throw new Error('No chat is available for local execution target updates.');
  }

  selectedChannel.pendingProvider = target.pendingProvider;
  selectedChannel.pendingModel = target.pendingModel;
  selectedChannel.pendingInstance = target.pendingInstance;
  selectedChannel.pendingModelSelection = target.pendingModelSelection;

  channelSummary.pendingProvider = target.pendingProvider;
  channelSummary.pendingModel = target.pendingModel;
  channelSummary.pendingModelSelection = target.pendingModelSelection;

  return next;
}

export function insertCreatedChannelIntoPayload(
  payload: AppShellPayload,
  createdChannel: ChatChannelView,
): AppShellPayload {
  const normalizedChannel = normalizeSelectedChannelView(createdChannel);
  if (!normalizedChannel) {
    throw new Error('Created channel payload was invalid.');
  }

  const next = structuredClone(payload);
  const defaultRecipientCatId = normalizedChannel.roomRouting.defaultRecipientId ?? null;
  const workflowStatus = normalizedChannel.roomRouting.workflow.activeTurn?.status
    ?? normalizedChannel.roomRouting.workflow.lastOutcomeEvent?.status
    ?? null;
  const routingStatus = workflowStatus === 'pending'
    ? 'running'
    : workflowStatus === 'failed'
      ? 'error'
      : workflowStatus;
  const lastRoutingAt = normalizedChannel.roomRouting.workflow.activeTurn?.updatedAt
    ?? normalizedChannel.roomRouting.workflow.lastOutcomeEvent?.createdAt
    ?? normalizedChannel.roomRouting.lastOutcome?.completedAt
    ?? normalizedChannel.roomRouting.lastCheckpoint?.createdAt
    ?? null;
  const assignedParticipants = resolveAssignedParticipants(normalizedChannel);
  const activeParticipants = activeAssignedParticipants(normalizedChannel);
  const summary: ChatChannelSummary = {
    id: normalizedChannel.id,
    title: normalizedChannel.title,
    topic: normalizedChannel.topic,
    channelKind: normalizedChannel.channelKind,
    status: normalizedChannel.status,
    unreadCount: normalizedChannel.unreadCount,
    catCount: assignedParticipants.length,
    activeCatCount: activeParticipants.length,
    participantCount: assignedParticipants.length,
    activeParticipantCount: activeParticipants.length,
    repoPath: normalizedChannel.repoPath,
    chatCwd: normalizedChannel.chatCwd,
    lastMessageAt: normalizedChannel.lastMessageAt,
    lastActivatedAt: normalizedChannel.lastActivatedAt,
    composerMode: normalizedChannel.composerMode,
    pendingProvider: normalizedChannel.pendingProvider,
    pendingModel: normalizedChannel.pendingModel,
    pendingModelSelection: normalizedChannel.pendingModelSelection ?? null,
    defaultRecipientCatId,
    roomMode: normalizedChannel.roomRouting.mode,
    routingStatus: routingStatus ?? undefined,
    lastRoutingAt,
  };

  next.chat.channels = [
    summary,
    ...next.chat.channels.filter((channel) => channel.id !== normalizedChannel.id),
  ];
  next.chat.selectedChannelId = normalizedChannel.id;
  next.chat.selectedChannel = normalizedChannel;
  next.metadata.generatedAt = normalizedChannel.updatedAt;

  return next;
}

export function BootShell() {
  return (
    <div className="screen bootShell" aria-label="Loading Cats Chat">
      <div className="bootSpinner" aria-hidden="true" />
    </div>
  );
}
