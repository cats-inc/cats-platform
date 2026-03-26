import type {
  AppShellPayload,
  ChatCat,
  ChatChannelSummary,
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

export function BootShell() {
  return (
    <div className="screen bootShell" aria-label="Loading Cats Chat">
      <div className="bootSpinner" aria-hidden="true" />
    </div>
  );
}
