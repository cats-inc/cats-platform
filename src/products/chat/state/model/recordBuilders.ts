import { randomUUID } from 'node:crypto';

import type {
  ChannelCatAssignment,
  ChatCat,
  ChatChannelState,
  ChatMessage,
  CreateCatInput,
  MessageUsageSummary,
} from '../../api/contracts.js';
import type { ChatMessageSenderKind } from '../../../../shared/roomRouting.js';
import {
  extractChatMessageChoicesFromBody,
  normalizeChatMessageChoiceResponse,
} from '../../shared/messageChoices.js';
import { cloneProviderModelSelection } from '../../../../shared/providerSelection.js';
import { defaultCatProducts, normalizeSuiteSurfaceList } from '../../../../shared/suiteSurfaces.js';
import { createEmptyExecutionLease, createEmptyMemoryCheckpoint } from '../defaults.js';
import { parseMentions } from '../mentionParsing.js';
import { normalizeList, normalizeOptionalText } from './shared.js';

export function createMessageRecord(
  channelId: string,
  senderKind: ChatMessageSenderKind,
  senderName: string,
  body: string,
  createdAt: string,
  metadata: Record<string, unknown>,
  usage: MessageUsageSummary | null,
  execution: {
    provider?: string | null;
    model?: string | null;
    instance?: string | null;
  } = {},
  structured: {
    choices?: ChatMessage['choices'];
    choiceResponse?: ChatMessage['choiceResponse'];
  } = {},
): ChatMessage {
  const { body: normalizedBody, choices } = extractChatMessageChoicesFromBody(
    body.trim(),
    structured.choices,
  );
  const choiceResponse = normalizeChatMessageChoiceResponse(structured.choiceResponse);

  return {
    id: randomUUID(),
    channelId,
    senderKind,
    senderName,
    body: normalizedBody,
    ...(choices ? { choices } : {}),
    ...(choiceResponse ? { choiceResponse } : {}),
    mentions: parseMentions(normalizedBody),
    metadata,
    usage,
    executionProvider: execution.provider ?? null,
    executionModel: execution.model ?? null,
    executionInstance: execution.instance ?? null,
    createdAt,
  };
}

export function applyMessageToChannel(
  channel: ChatChannelState,
  message: ChatMessage,
  nowIso: string,
): void {
  channel.messages.push(message);
  channel.updatedAt = nowIso;
  channel.lastMessageAt = nowIso;
}

export function createCatRecord(input: CreateCatInput, nowIso: string): ChatCat {
  const name = input.name.trim();
  const provider = input.provider.trim();

  if (!name) {
    throw new Error('Cat name is required');
  }
  if (!provider) {
    throw new Error('Cat provider is required');
  }

  return {
    id: randomUUID(),
    name,
    roles: normalizeList(input.roles),
    skillProfile: normalizeOptionalText(input.skillProfile),
    mcpProfile: normalizeOptionalText(input.mcpProfile),
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
    archivedAt: null,
    avatarColor: null,
    avatarUrl: null,
    defaultExecutionTarget: {
      provider,
      instance: normalizeOptionalText(input.instance),
      model: normalizeOptionalText(input.model),
    },
    defaultModelSelection: cloneProviderModelSelection(input.modelSelection),
    products: normalizeSuiteSurfaceList(normalizeList(input.products), {
      fallback: defaultCatProducts(),
    }),
    memory: createEmptyMemoryCheckpoint(),
  };
}

export function createAssignmentRecord(
  cat: ChatCat,
  input: {
    provider?: string;
    instance?: string | null;
    model?: string | null;
    modelSelection?: ChatCat['defaultModelSelection'];
    roles?: string[];
  },
  nowIso: string,
): ChannelCatAssignment {
  const roles = normalizeList(input.roles);

  return {
    catId: cat.id,
    status: 'active',
    roles: roles.length > 0 ? roles : cat.roles,
    joinedAt: nowIso,
    leftAt: null,
    execution: {
      target: {
        provider: input.provider?.trim() || cat.defaultExecutionTarget.provider,
        instance:
          input.instance === undefined
            ? cat.defaultExecutionTarget.instance
            : normalizeOptionalText(input.instance),
        model:
          input.model === undefined
            ? cat.defaultExecutionTarget.model
            : normalizeOptionalText(input.model),
      },
      modelSelection: cloneProviderModelSelection(
        input.modelSelection === undefined
          ? cat.defaultModelSelection
          : input.modelSelection,
      ),
      lease: createEmptyExecutionLease(),
    },
  };
}
