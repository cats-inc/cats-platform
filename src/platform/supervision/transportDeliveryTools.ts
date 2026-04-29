import type { BotBindingRecord, CatsCoreState } from '../../core/types.js';
import type { CoreStore } from '../../core/store.js';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SupervisedToolManifest,
  type ToolResult,
} from './contracts.js';
import type { SupervisionRejectionCode } from './errors.js';
import type { SupervisedToolExecutor } from './toolBoundary.js';
import type { SupervisedToolRegistry } from './toolRegistry.js';
import {
  TELEGRAM_REPLY_LIMIT,
  chunkTelegramReply,
} from '../transports/telegram/chunking.js';
import type {
  TelegramConversationBinding,
  TelegramDeliveryReceipt,
  TelegramRelayContext,
} from '../transports/telegram/contracts.js';
import type { TelegramRelay } from '../transports/telegram/relay/index.js';

export const SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL = 'transport.telegram.text.send' as const;

const TELEGRAM_TEXT_DELIVERY_MAX_CHUNKS = 8;

export interface SupervisedTransportTarget {
  platform: 'telegram';
  bindingId: string;
}

export interface SupervisedTransportDeliveryApprovalPolicy {
  required: boolean;
  requestId?: string;
  summary?: string;
}

export interface SupervisedTelegramTextDeliveryInput {
  bindingId: string;
  text: string;
  roomId?: string | null;
  conversationId?: string | null;
  chatId?: string | null;
  disableLinkPreview?: boolean;
}

export interface SupervisedTelegramTextDeliveryResult {
  platform: 'telegram';
  bindingId: string;
  status: 'sent';
  conversationId: string | null;
  chatId: string | null;
  messageIds: string[];
  deliveryIds: string[];
  chunkCount: number;
  textPreview: string;
}

export interface SupervisedTransportDeliveryToolOptions {
  coreStore: CoreStore;
  telegramRelay: TelegramRelay;
  allowedTransportTargets?: SupervisedTransportTarget[];
  approval?: SupervisedTransportDeliveryApprovalPolicy;
}

export interface SupervisedTransportDeliveryTools {
  manifests: SupervisedToolManifest[];
  executors: {
    [SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL]: SupervisedToolExecutor<
      SupervisedTelegramTextDeliveryInput,
      SupervisedTelegramTextDeliveryResult
    >;
  };
  register(registry: SupervisedToolRegistry): void;
}

interface NormalizedTelegramTextDeliveryInput {
  bindingId: string;
  text: string;
  roomId: string | null;
  conversationId: string | null;
  chatId: string | null;
  disableLinkPreview: boolean;
}

interface TelegramDeliveryDestination {
  conversationId: string | null;
  chatId: string | null;
}

export function createSupervisedTransportDeliveryTools(
  options: SupervisedTransportDeliveryToolOptions,
): SupervisedTransportDeliveryTools {
  const manifests = createSupervisedTransportDeliveryToolManifests();

  return {
    manifests,
    executors: {
      [SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL]: createTelegramTextDeliveryExecutor(options),
    },
    register(registry) {
      for (const manifest of manifests) {
        registry.register(manifest);
      }
    },
  };
}

export function createSupervisedTransportDeliveryToolManifests(): SupervisedToolManifest[] {
  return [
    {
      schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
      name: SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL,
      manifestVersion: '1.0',
      description: [
        'Send bounded text or link content through a declared Telegram transport binding.',
      ].join(' '),
      sideEffect: 'external_visible',
      preflight: 'required',
      blocking: 'blocking',
      cancellation: 'best_effort',
      approval: 'policy',
      evidence: 'summary',
      failureCodes: [
        'E_NOT_AUTHORIZED',
        'E_PRECHECK_FAILED',
        'E_SCHEMA_INVALID',
        'E_TOOL_SCOPE_DENIED',
      ],
      inputSchema: {
        id: `${SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL}.input`,
        version: '1.0',
        format: 'json_schema',
      },
      outputSchema: {
        id: `${SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL}.output`,
        version: '1.0',
        format: 'json_schema',
      },
    },
  ];
}

function createTelegramTextDeliveryExecutor(
  options: SupervisedTransportDeliveryToolOptions,
): SupervisedToolExecutor<
  SupervisedTelegramTextDeliveryInput,
  SupervisedTelegramTextDeliveryResult
> {
  return async (rawInput) => {
    const normalized = normalizeTelegramTextDeliveryInput(rawInput);
    if (normalized.status !== 'applied') {
      return normalized;
    }

    const input = normalized.result;
    const chunks = chunkTelegramReply(input.text, TELEGRAM_REPLY_LIMIT);
    if (chunks.length > TELEGRAM_TEXT_DELIVERY_MAX_CHUNKS) {
      return rejected(
        'E_SCHEMA_INVALID',
        `Telegram text delivery is limited to ${TELEGRAM_TEXT_DELIVERY_MAX_CHUNKS} chunks.`,
      );
    }

    if (!isAllowedTransportTarget(options.allowedTransportTargets, input.bindingId)) {
      return rejected(
        'E_NOT_AUTHORIZED',
        `Telegram binding is outside the declared transport target surface: ${input.bindingId}`,
      );
    }

    const core = await options.coreStore.readCore();
    const binding = resolveTelegramBinding(core, input.bindingId);
    if (!binding) {
      return rejected('E_PRECHECK_FAILED', `Active Telegram binding not found: ${input.bindingId}`);
    }

    const destination = resolveTelegramDeliveryDestination(options.telegramRelay, binding, input);
    if (destination.status !== 'applied') {
      return destination;
    }

    const approval = resolveDeliveryApproval(options.approval, binding, input);
    if (approval) {
      return approval;
    }

    const context = buildTelegramRelayContext(core, binding);
    const receipts: TelegramDeliveryReceipt[] = [];
    for (const chunk of chunks) {
      const receipt = await options.telegramRelay.deliver({
        request: {
          operation: 'send',
          conversationId: destination.result.conversationId,
          chatId: destination.result.chatId,
          text: chunk,
          disableLinkPreview: input.disableLinkPreview,
        },
        context,
      });
      receipts.push(receipt);

      if (receipt.status !== 'sent') {
        return rejected(
          'E_PRECHECK_FAILED',
          'Telegram delivery failed before all chunks were sent.',
          {
            failedReceipt: receipt,
            receipts,
          },
        );
      }
    }

    return {
      status: 'applied',
      result: {
        platform: 'telegram',
        bindingId: binding.id,
        status: 'sent',
        conversationId: receipts.at(-1)?.conversationId ?? destination.result.conversationId,
        chatId: receipts.at(-1)?.chatId ?? destination.result.chatId,
        messageIds: receipts
          .map((receipt) => receipt.messageId)
          .filter((messageId): messageId is string => messageId !== null),
        deliveryIds: receipts.map((receipt) => receipt.deliveryId),
        chunkCount: chunks.length,
        textPreview: createTextPreview(input.text),
      },
    };
  };
}

function resolveDeliveryApproval(
  approval: SupervisedTransportDeliveryApprovalPolicy | undefined,
  binding: BotBindingRecord,
  input: NormalizedTelegramTextDeliveryInput,
): ToolResult<SupervisedTelegramTextDeliveryResult> | null {
  if (approval?.required !== true) {
    return null;
  }

  return {
    status: 'pending_approval',
    requestId: approval.requestId ?? `telegram-delivery:${binding.id}`,
    summary: approval.summary ?? [
      `Send Telegram text through ${binding.botName}`,
      `binding=${binding.id}`,
      `preview=${createTextPreview(input.text)}`,
    ].join(' '),
  };
}

function normalizeTelegramTextDeliveryInput(
  input: SupervisedTelegramTextDeliveryInput,
): ToolResult<NormalizedTelegramTextDeliveryInput> {
  if (!isRecord(input)) {
    return rejected('E_SCHEMA_INVALID', 'Telegram delivery input must be an object.');
  }

  const bindingId = readNonEmptyString(input.bindingId);
  if (!bindingId) {
    return rejected('E_SCHEMA_INVALID', 'Telegram delivery bindingId is required.');
  }

  const text = readNonEmptyString(input.text);
  if (!text) {
    return rejected('E_SCHEMA_INVALID', 'Telegram delivery text is required.');
  }

  return {
    status: 'applied',
    result: {
      bindingId,
      text,
      roomId: readNonEmptyString(input.roomId),
      conversationId: readNonEmptyString(input.conversationId),
      chatId: readNonEmptyString(input.chatId),
      disableLinkPreview: input.disableLinkPreview !== false,
    },
  };
}

function isAllowedTransportTarget(
  allowedTargets: SupervisedTransportTarget[] | undefined,
  bindingId: string,
): boolean {
  return allowedTargets === undefined || allowedTargets.some((target) =>
    target.platform === 'telegram' && target.bindingId === bindingId,
  );
}

function resolveTelegramBinding(
  core: CatsCoreState,
  bindingId: string,
): BotBindingRecord | null {
  return core.botBindings.find((binding) =>
    binding.id === bindingId &&
    binding.platform === 'telegram' &&
    binding.status === 'active',
  ) ?? null;
}

function resolveTelegramDeliveryDestination(
  relay: TelegramRelay,
  binding: BotBindingRecord,
  input: NormalizedTelegramTextDeliveryInput,
): ToolResult<TelegramDeliveryDestination> {
  if (input.conversationId) {
    const linked = relay.resolveBinding({ conversationId: input.conversationId });
    if (linked && !linkedMatchesBinding(linked, binding.id)) {
      return rejected(
        'E_PRECHECK_FAILED',
        `Telegram conversation is not linked to binding: ${binding.id}`,
      );
    }

    return {
      status: 'applied',
      result: {
        conversationId: input.conversationId,
        chatId: input.chatId ?? linked?.telegramChatId ?? null,
      },
    };
  }

  if (input.chatId) {
    const linked = relay.resolveBinding({ chatId: input.chatId, bindingId: binding.id });
    if (linked && !linkedMatchesBinding(linked, binding.id)) {
      return rejected('E_PRECHECK_FAILED', `Telegram chat is not linked to binding: ${binding.id}`);
    }

    return {
      status: 'applied',
      result: {
        conversationId: linked?.conversationId ?? null,
        chatId: input.chatId,
      },
    };
  }

  if (input.roomId) {
    const linked = relay.resolveBinding({ roomId: input.roomId, bindingId: binding.id });
    if (!linked || !linkedMatchesBinding(linked, binding.id)) {
      return rejected(
        'E_PRECHECK_FAILED',
        `Telegram room is not linked to binding: ${binding.id}`,
      );
    }

    return {
      status: 'applied',
      result: {
        conversationId: linked.conversationId,
        chatId: linked.telegramChatId,
      },
    };
  }

  const soleConversation = relay.findSoleUnlinkedConversation(binding.id);
  if (!soleConversation || !linkedMatchesBinding(soleConversation, binding.id)) {
    return rejected(
      'E_PRECHECK_FAILED',
      `Telegram binding has no unambiguous delivery conversation: ${binding.id}`,
    );
  }

  return {
    status: 'applied',
    result: {
      conversationId: soleConversation.conversationId,
      chatId: soleConversation.telegramChatId,
    },
  };
}

function buildTelegramRelayContext(
  core: CatsCoreState,
  selectedBinding: BotBindingRecord,
): TelegramRelayContext {
  const botBindings = core.botBindings.filter((binding) =>
    binding.platform === 'telegram' && binding.status === 'active',
  );

  return {
    bossCatId: null,
    bossCatName: null,
    bossCatActorId: selectedBinding.bossCatActorId,
    botBindings,
    defaultBotBinding: selectedBinding,
    selectedBotBinding: selectedBinding,
  };
}

function linkedMatchesBinding(binding: TelegramConversationBinding, bindingId: string): boolean {
  return binding.bindingId === null || binding.bindingId === bindingId;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function createTextPreview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function rejected<T>(
  code: SupervisionRejectionCode,
  message: string,
  details?: unknown,
): ToolResult<T> {
  return {
    status: 'rejected',
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}
