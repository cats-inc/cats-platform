import type {
  ProviderAgentBoundedObservation,
  ProviderAgentDecision,
} from '../../../../platform/orchestration/index.js';
import {
  createInMemoryToolEvidenceSink,
  createSupervisedToolRegistry,
  createToolBoundary,
} from '../../../../platform/supervision/index.js';
import {
  CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY,
  resolveChatMessageLocalizedBodyMetadata,
  type ChatMessageLocalizedBodyMetadata,
} from '../../../../shared/chatMessageLocalization.js';
import { isCompanionCat } from '../../../../shared/companionRole.js';
import {
  createTranslator,
  messageKeys,
  type MessageLocale,
} from '../../../../shared/i18n/index.js';
import type { ChatMessage, ChatState } from '../../api/contracts.js';
import {
  COMPANION_CONTENT_POST_CREATE_TOOL,
  createCompanionContentTools,
  type CompanionContentPostCreateInput,
  type CompanionContentPostCreateResult,
} from '../../companion/supervisedContentTools.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import { appendMessage } from '../model/index.js';

export const COMPANION_POST_RESULT_METADATA_KEY = 'companionPostResult' as const;

export interface CompanionPostResultMetadata {
  decisionId: string;
  sourceMessageId: string;
  catId: string;
  derivedId: string;
  postId: string;
  title: string;
  publishedAt: string;
}

const CAT_ACTOR_REF_PREFIX = 'cat:';

/**
 * Runs a companion Cat's `companion.content.post.create` decision through the
 * supervised tool boundary and leaves a notice in the conversation. Unlike the
 * Work sidecars, the result does not replace the Cat's turn: the Cat still
 * replies, and sees the new post through its companion prompt context.
 */
export async function appendCompanionPostResultSidecar(input: {
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  observation: ProviderAgentBoundedObservation | null | undefined;
  companionStore?: CompanionBoxStore;
  locale: MessageLocale;
  now: Date;
}): Promise<{ state: ChatState; resultMessage: ChatMessage | null }> {
  const decision = input.providerAgentDecision;
  if (decision?.kind !== 'tool_request' || decision.toolName !== COMPANION_CONTENT_POST_CREATE_TOOL) {
    return { state: input.state, resultMessage: null };
  }
  const ignore = (reason: string, details?: unknown) => {
    console.warn('Companion post tool call ignored.', {
      feature: 'companion_post',
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: decision.decisionId,
      reason,
      ...(details ? { details } : {}),
    });
    return { state: input.state, resultMessage: null };
  };

  if (
    decision.target.kind !== 'worker_tool'
    || decision.target.toolName !== COMPANION_CONTENT_POST_CREATE_TOOL
  ) {
    return ignore('tool_request_target_mismatch', { target: decision.target });
  }
  const observation = input.observation;
  if (!observation?.availableTools.some(({ manifest }) =>
    manifest.name === COMPANION_CONTENT_POST_CREATE_TOOL)) {
    return ignore('tool_not_offered');
  }
  const actorRef = observation.actor.actorRef;
  const catId = actorRef.startsWith(CAT_ACTOR_REF_PREFIX)
    ? actorRef.slice(CAT_ACTOR_REF_PREFIX.length)
    : null;
  const cat = catId ? input.state.cats.find((candidate) => candidate.id === catId) ?? null : null;
  if (!cat || !isCompanionCat(cat)) {
    return ignore('not_companion_cat', { actorRef });
  }
  if (!input.companionStore) {
    return ignore('missing_companion_store');
  }
  const toolInput = readPostInput(decision.input, cat.id);
  if (!toolInput) {
    return ignore('input_invalid');
  }

  const tools = createCompanionContentTools({
    companionStore: input.companionStore,
    // The Cat may only publish on its own profile, whatever the decision said.
    resourceScopes: [{ kind: 'companion_content', catId: cat.id }],
    now: () => input.now,
  });
  const registry = createSupervisedToolRegistry();
  tools.register(registry);
  const boundary = createToolBoundary({
    registry,
    evidenceSink: createInMemoryToolEvidenceSink(),
    now: () => input.now.toISOString(),
  });
  const toolScope = observation.policy.dials.toolScope;
  const result = await boundary.invoke<CompanionContentPostCreateInput, CompanionContentPostCreateResult>({
    toolName: COMPANION_CONTENT_POST_CREATE_TOOL,
    input: toolInput,
    actionId: `${decision.decisionId}:companion-post`,
    runId: `chat:${input.channelId}`,
    actorRef,
    grant: {
      parentToolScope: observation.policy.parentToolScope ?? toolScope,
      policyToolScope: toolScope,
    },
    execute: tools.executors[COMPANION_CONTENT_POST_CREATE_TOOL],
  });
  if (result.status !== 'applied') {
    return result.status === 'rejected'
      ? ignore(result.error.code, result.error.details ?? result.error.message)
      : ignore('pending_approval');
  }

  const metadata: CompanionPostResultMetadata = {
    decisionId: decision.decisionId,
    sourceMessageId: input.userMessage.id,
    catId: cat.id,
    derivedId: result.result.derivedId,
    postId: result.result.postId,
    title: result.result.title,
    publishedAt: result.result.publishedAt,
  };
  const localizedBody: ChatMessageLocalizedBodyMetadata = {
    key: messageKeys.chatCompanionPostPublishedNotice,
    values: { name: cat.name, title: metadata.title },
  };
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Chat',
      body: resolveChatMessageLocalizedBodyMetadata(localizedBody, createTranslator(input.locale)),
    },
    input.now,
    {
      metadata: {
        event: 'companion_post_published',
        sourceMessageId: input.userMessage.id,
        [COMPANION_POST_RESULT_METADATA_KEY]: metadata,
        [CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY]: localizedBody,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    resultMessage: append.message,
  };
}

function readPostInput(value: unknown, catId: string): CompanionContentPostCreateInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.body !== 'string') {
    return null;
  }

  return {
    catId,
    body: record.body,
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
    ...(Array.isArray(record.tags)
      ? { tags: record.tags.filter((tag): tag is string => typeof tag === 'string') }
      : {}),
  };
}
