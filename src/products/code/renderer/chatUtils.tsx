import type {
  AppShellPayload,
  ChatChannelView,
  ChatCat,
  ChatChannelSummary,
  ChatMessage,
  CreateChatChannelInput,
} from '../api/contracts';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { buildExecutionLabel } from '../../../shared/executionLabel.js';
import { defaultCatProducts, hasSuiteSurface } from '../../../shared/suiteSurfaces.js';
import {
  normalizeSelectedChannelView,
  type SelectedChannelView,
} from '../shared/channelEntry';

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
  return hasSuiteSurface(cat.products, 'chat', {
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
  repoPath?: string | null;
  leadCatId?: string | null;
  participantCatIds?: string[];
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
    repoPath,
    leadCatId,
    participantCatIds = [],
    draftModel,
  } = options;
  const normalizedLeadCatId = leadCatId?.trim() || null;
  const normalizedParticipantCatIds = participantCatIds.filter((id) => id !== normalizedLeadCatId);
  const baseInput: CreateChatChannelInput = {
    title: createDraftChannelTitle(body, existingCount),
    topic: createDraftChannelTopic(body),
    skipBossCatGreeting: true,
    repoPath: repoPath ?? undefined,
  };

  if (normalizedLeadCatId) {
    return {
      ...baseInput,
      leadParticipantId: normalizedLeadCatId,
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

export const GREETING_LINES = [
  "Meow. Ready when you are.",
  "Your cat hasn't napped yet.",
  "Cats on the keyboard.",
  "Tail up, let's go.",
  "Purring in standby.",
  "Claws sharpened. What's the task?",
  "This cat doesn't sleep on the job.",
];

export function pickGreeting(): string {
  return GREETING_LINES[Math.floor(Math.random() * GREETING_LINES.length)];
}

export function resolveBossCatName(payload: AppShellPayload): string | null {
  if (!payload.chat.bossCatId) {
    return null;
  }

  return payload.chat.cats.find((cat) => cat.id === payload.chat.bossCatId)?.name ?? null;
}

export type { SelectedChannelView } from '../shared/channelEntry';

export function createEmptyParticipantLease(): SelectedChannelView['orchestratorLease'] {
  return {
    sessionId: null,
    status: 'not_started',
    cwd: null,
    lastError: null,
    provider: null,
    model: null,
    startedAt: null,
    lastUsedAt: null,
  };
}

export function createOptimisticUserMessage(
  channelId: string,
  body: string,
  senderName: string,
  createdAt: string,
) {
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    channelId,
    senderKind: 'user' as const,
    senderName: senderName.trim() || 'User',
    body,
    mentions: [],
    metadata: { optimistic: true },
    usage: null,
    createdAt,
  };
}

export function createOptimisticDraftPayload(
  payload: AppShellPayload,
  body: string,
  leadCatId?: string | null,
  options: {
    composerMode?: 'solo' | 'cat_led';
    pendingProvider?: string | null;
    pendingModel?: string | null;
    pendingInstance?: string | null;
    pendingModelSelection?: ProviderModelSelection | null;
  } = {},
): { payload: AppShellPayload; channelId: string } {
  const createdAt = new Date().toISOString();
  const channelId = `draft-${crypto.randomUUID()}`;
  const title = createDraftChannelTitle(body, payload.chat.channels.length);
  const topic = createDraftChannelTopic(body);
  const message = createOptimisticUserMessage(channelId, body, payload.ownerDisplayName, createdAt);
  const composerMode = options.composerMode ?? (leadCatId ? 'cat_led' : 'solo');
  const channelSummary: ChatChannelSummary = {
    id: channelId,
    title,
    topic,
    status: 'planned',
    unreadCount: 0,
    catCount: 0,
    activeCatCount: 0,
    repoPath: null,
    chatCwd: null,
    lastMessageAt: createdAt,
    lastActivatedAt: null,
    composerMode,
    pendingProvider: options.pendingProvider ?? null,
    pendingModel: options.pendingModel ?? null,
    pendingModelSelection: options.pendingModelSelection ?? null,
    ...(leadCatId ? {
      leadCatId,
    } : {}),
  };
  const selectedChannel = normalizeSelectedChannelView({
    id: channelId,
    title,
    topic,
    status: 'planned' as const,
    unreadCount: 0,
    repoPath: null,
    chatCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual' as const,
    skillProfile: 'chat-default',
    mcpProfile: 'chat-memory',
    orchestratorRoles: [] as string[],
    composerMode,
    pendingProvider: options.pendingProvider ?? null,
    pendingModel: options.pendingModel ?? null,
    pendingInstance: options.pendingInstance ?? null,
    pendingModelSelection: options.pendingModelSelection ?? null,
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: createdAt,
    lastActivatedAt: null,
    orchestratorLease: createEmptyParticipantLease(),
    catAssignments: [] as never[],
    messages: [message],
    assignedCats: [] as never[],
  });

  if (!selectedChannel) {
    throw new Error('Failed to normalize optimistic draft channel.');
  }

  return {
    channelId,
    payload: {
      ...structuredClone(payload),
      chat: {
        ...structuredClone(payload.chat),
        channels: [channelSummary, ...structuredClone(payload.chat.channels)],
        selectedChannelId: channelId,
        selectedChannel,
      },
      metadata: {
        ...structuredClone(payload.metadata),
        generatedAt: createdAt,
      },
    },
  };
}

export function appendOptimisticUserMessage(
  payload: AppShellPayload,
  channelId: string,
  body: string,
): AppShellPayload {
  const createdAt = new Date().toISOString();
  const next = structuredClone(payload);
  const selectedChannel = next.chat.selectedChannel;
  const channelSummary = next.chat.channels.find((channel) => channel.id === channelId);

  if (!selectedChannel || selectedChannel.id !== channelId || !channelSummary) {
    throw new Error('No chat is available for optimistic updates.');
  }

  selectedChannel.messages.push(
    createOptimisticUserMessage(channelId, body, next.ownerDisplayName, createdAt),
  );
  selectedChannel.updatedAt = createdAt;
  selectedChannel.lastMessageAt = createdAt;
  selectedChannel.unreadCount = 0;

  channelSummary.lastMessageAt = createdAt;
  channelSummary.unreadCount = 0;
  next.chat.selectedChannelId = channelId;
  next.metadata.generatedAt = createdAt;

  return next;
}

export function applyOptimisticPendingExecutionTarget(
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
    throw new Error('No chat is available for optimistic execution target updates.');
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
  const leadCatId = normalizedChannel.roomRouting.leadParticipantId ?? null;
  const summary: ChatChannelSummary = {
    id: normalizedChannel.id,
    title: normalizedChannel.title,
    topic: normalizedChannel.topic,
    channelKind: normalizedChannel.channelKind,
    status: normalizedChannel.status,
    unreadCount: normalizedChannel.unreadCount,
    catCount: normalizedChannel.assignedCats.length,
    activeCatCount: normalizedChannel.assignedCats.filter((cat) => cat.status === 'active').length,
    repoPath: normalizedChannel.repoPath,
    chatCwd: normalizedChannel.chatCwd,
    lastMessageAt: normalizedChannel.lastMessageAt,
    lastActivatedAt: normalizedChannel.lastActivatedAt,
    composerMode: normalizedChannel.composerMode,
    pendingProvider: normalizedChannel.pendingProvider,
    pendingModel: normalizedChannel.pendingModel,
    pendingModelSelection: normalizedChannel.pendingModelSelection ?? null,
    leadCatId,
    roomMode: normalizedChannel.roomRouting.mode,
    routingStatus: normalizedChannel.roomRouting.workflow.currentTurn?.status ?? null,
    lastRoutingAt: normalizedChannel.roomRouting.workflow.currentTurn?.startedAt ?? null,
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

export function preserveOptimisticUserMessageAfterRefresh(
  previousPayload: AppShellPayload,
  refreshedPayload: AppShellPayload,
  channelId: string,
): AppShellPayload {
  const previousSelectedChannel = previousPayload.chat.selectedChannel;
  const optimisticMessage =
    previousSelectedChannel?.id === channelId
      ? [...previousSelectedChannel.messages].reverse().find(
          (message) => message.senderKind === 'user' && message.metadata?.optimistic,
        ) ?? null
      : null;

  if (!optimisticMessage) {
    return refreshedPayload;
  }

  const next = structuredClone(refreshedPayload);
  const selectedChannel = next.chat.selectedChannel;
  const channelSummary = next.chat.channels.find((channel) => channel.id === channelId);

  if (!selectedChannel || selectedChannel.id !== channelId || !channelSummary) {
    return refreshedPayload;
  }

  const alreadyPresent = selectedChannel.messages.some(
    (message) => message.id === optimisticMessage.id,
  );
  if (alreadyPresent) {
    return refreshedPayload;
  }

  selectedChannel.messages.push(structuredClone(optimisticMessage));
  selectedChannel.updatedAt = optimisticMessage.createdAt;
  selectedChannel.lastMessageAt = optimisticMessage.createdAt;
  selectedChannel.unreadCount = 0;

  channelSummary.lastMessageAt = optimisticMessage.createdAt;
  channelSummary.unreadCount = 0;
  next.chat.selectedChannelId = channelId;
  next.metadata.generatedAt = optimisticMessage.createdAt;

  return next;
}

export function BootShell() {
  return (
    <div className="screen bootShell" aria-label="Loading Cats Code">
      <div className="bootSpinner" aria-hidden="true" />
    </div>
  );
}
