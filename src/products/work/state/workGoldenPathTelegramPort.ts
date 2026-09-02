/**
 * Telegram adapter for the golden path (SPEC-114, ADR-112 section 4).
 *
 * This is the only place where transport facts meet product decisions. The
 * bridge hands over opaque external references; this module resolves readiness,
 * target, and delivery policy through an injected resolver, then calls the
 * product-owned service. The service still owns every authorization decision —
 * nothing here touches Core.
 */

import type { CoreDeliveryGate, CoreDeliveryMode } from '../../../core/types.js';
import type { SupervisionToolScope } from '../../../platform/supervision/contracts.js';
import type {
  TelegramDeliveryReceipt,
  TelegramInlineKeyboardMarkup,
  TelegramRelayContext,
} from '../../../platform/transports/telegram/contracts.js';
import type { TelegramRelay } from '../../../platform/transports/telegram/relay/index.js';
import type {
  TransportWorkDeliveryPayload,
  TransportWorkReadiness,
} from '../../../platform/transports/work-delivery/contracts.js';
import {
  decodeTransportWorkCallbackData,
} from '../../../platform/transports/work-delivery/actionTokens.js';
import type {
  TransportWorkGoldenPathPort,
  TransportWorkHandledResult,
} from '../../../platform/transports/work-delivery/port.js';
import type { TransportWorkOutboxSender } from '../../../platform/transports/work-delivery/outbox.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import type { WorkGoldenPathService } from './workGoldenPathService.js';

/**
 * Everything the product must decide before a proposal can be shown, resolved
 * per request because a binding's Cat, workspace, and policy can all change
 * between two `/work` messages.
 */
export interface TelegramGoldenPathContext {
  readiness: TransportWorkReadiness;
  ownerActorId: string;
  targetLabel: string;
  projectId: string | null;
  workspacePath: string | null;
  deliveryMode: CoreDeliveryMode;
  deliveryGates: CoreDeliveryGate[];
  acceptanceCriteria: string[];
  openQuestion: string | null;
  /** The envelope supervised execution may use for this request. */
  toolScope: SupervisionToolScope;
}

export type TelegramGoldenPathContextResolver = (input: {
  bindingId: string;
  conversationId: string;
  externalUserRef: string;
  goal: string;
}) => Promise<TelegramGoldenPathContext>;

export interface CreateTelegramGoldenPathPortInput {
  service: WorkGoldenPathService;
  resolveContext: TelegramGoldenPathContextResolver;
  /**
   * Called once per newly admitted Run so the host can start supervised
   * execution (SPEC-114 FR-14, FR-28).
   *
   * Deliberately fire-and-forget from the transport's point of view: the
   * callback handler must acknowledge and return, never wait for the run. It is
   * not invoked for `already_admitted`, so a replayed button cannot start a
   * second execution of the same scope.
   */
  onAdmitted?: (input: { runId: string; taskId: string | null; workItemId: string }) => void;
  /**
   * Called when an owner retry or resume left a Run ready to be driven again.
   *
   * Same contract as `onAdmitted`: fire-and-forget, because the callback
   * handler has already acknowledged and the run may take minutes.
   */
  onRedrive?: (input: { runId: string; workItemId: string }) => void;
}

/** The refusal reasons `classifyTransportWorkInbound` can produce. */
const REFUSAL_KEYS: Record<string, MessageKey> = {
  'workDelivery.inbound.attachmentNotIngested':
    messageKeys.workDeliveryInboundAttachmentNotIngested,
  'workDelivery.inbound.goalRequired': messageKeys.workDeliveryInboundGoalRequired,
};

function handled(
  outcome: TransportWorkHandledResult['outcome'],
  workItemId: string | null = null,
  rejection: string | null = null,
): TransportWorkHandledResult {
  return { handled: true, outcome, workItemId, rejection };
}

export function createTelegramGoldenPathPort(
  input: CreateTelegramGoldenPathPortInput,
): TransportWorkGoldenPathPort {
  const { service, resolveContext } = input;

  return {
    ownsCallback(callbackData) {
      return decodeTransportWorkCallbackData(callbackData) !== null;
    },

    async handleWorkCommand(command) {
      const context = await resolveContext({
        bindingId: command.bindingId,
        conversationId: command.conversationId,
        externalUserRef: command.externalUserRef,
        goal: command.goal,
      });

      const result = await service.receiveRequest({
        bindingId: command.bindingId,
        conversationId: command.conversationId,
        ownerActorId: context.ownerActorId,
        externalUserRef: command.externalUserRef,
        externalConversationRef: command.externalConversationRef,
        externalUpdateRef: command.externalUpdateRef,
        externalMessageRef: command.externalMessageRef,
        goal: command.goal,
        targetLabel: context.targetLabel,
        projectId: context.projectId,
        workspacePath: context.workspacePath,
        acceptanceCriteria: context.acceptanceCriteria,
        deliveryMode: context.deliveryMode,
        deliveryGates: context.deliveryGates,
        openQuestion: context.openQuestion,
        readiness: context.readiness,
        locale: command.locale,
      });

      return handled(
        result.status === 'accepted' ? 'accepted' : 'not_ready',
        result.workItemId,
      );
    },

    async handleActionCallback(callback) {
      // Readiness is re-evaluated at authorization time, not reused from
      // intake: a provider can disappear between the proposal and the tap.
      const context = await resolveContext({
        bindingId: callback.bindingId,
        conversationId: callback.conversationId,
        externalUserRef: callback.externalUserRef,
        goal: '',
      });

      const result = await service.authorize({
        callbackData: callback.callbackData,
        bindingId: callback.bindingId,
        externalUserRef: callback.externalUserRef,
        ownerEventRef: callback.ownerEventRef,
        readiness: context.readiness,
      });

      if (result.status === 'rejected') {
        return handled('rejected', null, result.rejection ?? null);
      }

      if (
        (result.status === 'retried' || result.status === 'resumed')
        && result.redriveRunId
      ) {
        input.onRedrive?.({
          runId: result.redriveRunId,
          workItemId: result.workItemId ?? '',
        });
      }
      if (result.status === 'admitted' && result.admission?.runId) {
        input.onAdmitted?.({
          runId: result.admission.runId,
          taskId: result.admission.taskId,
          workItemId: result.admission.workItemId,
        });
      }
      return handled(result.status, result.admission?.taskId ?? null);
    },

    async refuse(refusal) {
      // The classifier names its reason as a plain string so `platform/` needs
      // no i18n dependency; the product maps it onto a real key here. An
      // unrecognized reason degrades to the generic prompt rather than letting a
      // raw string reach the owner.
      const reasonKey = REFUSAL_KEYS[refusal.reasonKey]
        ?? messageKeys.workDeliveryInboundGoalRequired;
      await service.sendRefusal({
        bindingId: refusal.bindingId,
        externalConversationRef: refusal.externalConversationRef,
        externalUpdateRef: refusal.externalUpdateRef,
        reasonKey,
        locale: refusal.locale,
      });
      return handled('refused');
    },
  };
}

function buildInlineKeyboard(
  payload: TransportWorkDeliveryPayload,
): TelegramInlineKeyboardMarkup | undefined {
  if (payload.actions.length === 0) {
    return undefined;
  }
  return {
    inline_keyboard: [
      payload.actions.map((action) => ({
        text: action.label,
        callback_data: action.callbackData,
      })),
    ],
  };
}

/**
 * Reasons that mean the recorded binding is no longer usable.
 *
 * These are definite non-deliveries, and retrying changes nothing until the
 * operator restores the binding — so they are named rather than folded into a
 * generic transport error the owner would be invited to retry forever.
 */
const BINDING_UNAVAILABLE_REASONS: ReadonlySet<string> = new Set([
  'telegram_not_bound_to_boss_cat',
  'delivery_client_not_configured',
]);

/**
 * Classifies a delivery receipt into the outbox's three outcomes.
 *
 * The `ambiguous` distinction matters: a transport error that cannot prove
 * non-delivery must not be retried blindly (FR-47), so only errors Telegram
 * reported explicitly are treated as definite failures.
 */
function classifyDeliveryReceipt(receipt: TelegramDeliveryReceipt): {
  ok: boolean;
  externalMessageRef: string | null;
  errorCode: string | null;
  ambiguous: boolean;
} {
  if (receipt.status === 'sent') {
    return {
      ok: true,
      externalMessageRef: receipt.messageId,
      errorCode: null,
      ambiguous: false,
    };
  }
  if (receipt.reason !== undefined && BINDING_UNAVAILABLE_REASONS.has(receipt.reason)) {
    // The message definitely did not go, and it will not go to some *other*
    // binding either: FR-43 targets the binding that originated the request.
    return {
      ok: false,
      externalMessageRef: null,
      errorCode: 'binding_unavailable',
      ambiguous: false,
    };
  }
  return {
    ok: false,
    externalMessageRef: null,
    errorCode: receipt.reason ?? 'telegram_delivery_failed',
    ambiguous: receipt.reason === undefined,
  };
}

export interface CreateTelegramGoldenPathOutboxSenderInput {
  telegramRelay: TelegramRelay;
  /** Re-read per send so binding/boss changes are picked up (FR-43). */
  resolveRelayContext: () => TelegramRelayContext;
}

/**
 * Narrows a relay context to one binding.
 *
 * The relay resolves an *active* binding from its context, which is the right
 * default for interactive replies and the wrong one here: if the binding that
 * originated the work is gone, delivering through whichever binding happens to
 * be active now would put the owner's result in a different chat. FR-43 says
 * the destination is the recorded binding or nothing, so an absent binding
 * yields an empty context and the relay refuses.
 */
function scopeContextToBinding(
  context: TelegramRelayContext,
  bindingId: string,
): TelegramRelayContext {
  const recorded = context.botBindings.find((binding) => binding.id === bindingId) ?? null;
  return {
    ...context,
    botBindings: recorded === null ? [] : [recorded],
    defaultBotBinding: recorded,
    selectedBotBinding: recorded,
  };
}

/**
 * Turns an outbox row into one Telegram API call.
 *
 * The row already carries its destination and its localized text, so this stays
 * a pure translation step: no policy, no rendering, no idempotency of its own.
 */
export function createTelegramGoldenPathOutboxSender(
  input: CreateTelegramGoldenPathOutboxSenderInput,
): TransportWorkOutboxSender {
  return async (row) => {
    try {
      const receipt = await input.telegramRelay.deliver({
        request: {
          operation: 'send',
          chatId: row.externalConversationRef,
          text: row.payload.text,
          disableLinkPreview: true,
          replyMarkup: buildInlineKeyboard(row.payload) ?? null,
        },
        context: scopeContextToBinding(input.resolveRelayContext(), row.bindingId),
      });
      return classifyDeliveryReceipt(receipt);
    } catch (error) {
      // A thrown transport call proves nothing about delivery.
      return {
        ok: false,
        externalMessageRef: null,
        errorCode: error instanceof Error ? error.name : 'telegram_send_threw',
        ambiguous: true,
      };
    }
  };
}
