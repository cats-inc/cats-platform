/**
 * Host implementation of the transport-owned Telegram command port.
 *
 * Lives here rather than in `platform/` because answering these commands needs
 * the chat store and a Cat's skill profile, and `platform/` must not import
 * product code. Both ingress modes get this one instance, so `/status` answers
 * identically on webhook and on long polling — it previously only existed on the
 * webhook path.
 */

import { createCatActorId } from '../../core/actors.js';
import type { BotBindingRecord } from '../../core/types.js';
import {
  createTelegramCommandRouter,
  type TelegramCommandDelegationStatus,
  type TelegramInteractionMode,
  type TelegramPresenceChange,
} from '../../platform/transports/telegram/commandRouter.js';
import { createDefaultCommands } from '../../platform/transports/telegram/commands/index.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import type {
  TelegramCommandPort,
  TelegramCommandPortInput,
  TelegramCommandPortReply,
} from '../../platform/transports/telegram/commandPort.js';
import type { TelegramPollingSupervisor } from '../../platform/transports/telegram/polling.js';
import type { ChatState } from '../../products/chat/api/contracts.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import { setCatCompanion } from '../../products/chat/state/model/index.js';
import { isCompanionCat } from '../../shared/companionRole.js';
import { shouldBridgeTelegramProductIntentCommand } from '../../server/telegramProductIntentCommands.js';
import {
  resolveTransportWorkLocalExecutionStatus,
  type TransportWorkReadinessReport,
} from './transportWorkGoldenPath.js';

export interface CreateTelegramCommandSurfaceInput {
  chatStore: ChatStore;
  pollingSupervisor?: TelegramPollingSupervisor;
  /**
   * The golden path's readiness reader. Absent means delegation is off for this
   * host, which `/status` reports as such rather than staying silent.
   */
  readiness?: { describe(): Promise<TransportWorkReadinessReport> };
  /** Runtime health is still shown when work delegation itself is disabled. */
  runtimeHealth?: Pick<RuntimeClient, 'getHealth'>;
  /** `/sleep` and `/wake`; absent, those commands say the bot is not configurable. */
  setCatPresence?: (catId: string, presence: 'awake' | 'sleeping') => Promise<TelegramPresenceChange>;
}

function findBindingChatCat(chatState: ChatState, binding: BotBindingRecord) {
  return chatState.cats.find((cat) =>
    createCatActorId(cat.id) === (binding.catActorId ?? binding.bossCatActorId),
  ) ?? null;
}

/** `/mode` toggles the Cat's companion role and leaves its skill profile alone. */
function resolveInteractionMode(
  cat: { roles: readonly string[] } | null | undefined,
): TelegramInteractionMode {
  return isCompanionCat(cat) ? 'companion' : 'agent';
}

async function setInteractionMode(
  chatStore: ChatStore,
  catId: string,
  mode: TelegramInteractionMode,
): Promise<TelegramInteractionMode> {
  const state = await chatStore.read();
  const persisted = await chatStore.write(
    setCatCompanion(state, catId, mode === 'companion'),
  );
  const cat = persisted.cats.find((candidate) => candidate.id === catId);
  return resolveInteractionMode(cat);
}

export function createTelegramCommandSurface(
  input: CreateTelegramCommandSurfaceInput,
): TelegramCommandPort {
  const router = createTelegramCommandRouter();
  router.registerAll(createDefaultCommands());

  async function resolveLocalExecution() {
    if (input.runtimeHealth === undefined) {
      return 'unknown' as const;
    }
    try {
      return resolveTransportWorkLocalExecutionStatus(await input.runtimeHealth.getHealth());
    } catch {
      return 'unavailable' as const;
    }
  }

  /**
   * Resolves what `/status` may claim about delegation.
   *
   * A failure to resolve is reported as "could not be checked" rather than as
   * ready: FR-5 forbids implying the host can honour work when that is unknown.
   */
  async function resolveDelegation(
    bindingId: string | null,
  ): Promise<TelegramCommandDelegationStatus | null> {
    const bindingHealth = bindingId
      ? input.pollingSupervisor?.getPollingStatus(bindingId)?.health ?? null
      : null;
    if (input.readiness === undefined) {
      return {
        bindingHealth,
        localExecution: await resolveLocalExecution(),
        enabled: false,
        canAcceptWork: false,
        blockerKeys: [],
      };
    }
    try {
      const report = await input.readiness.describe();
      const row = bindingId
        ? report.bindings.find((candidate) => candidate.bindingId === bindingId) ?? null
        : null;
      if (row === null) {
        return {
          bindingHealth,
          localExecution: report.localExecution ?? await resolveLocalExecution(),
          enabled: report.enabled,
          canAcceptWork: false,
          blockerKeys: [],
        };
      }
      return {
        bindingHealth,
        localExecution: report.localExecution ?? await resolveLocalExecution(),
        enabled: report.enabled,
        canAcceptWork: row.readiness.ready,
        blockerKeys: row.readiness.blockers.map((blocker) => blocker.remediationKey),
      };
    } catch {
      return {
        bindingHealth,
        localExecution: await resolveLocalExecution(),
        enabled: null,
        canAcceptWork: false,
        blockerKeys: [],
      };
    }
  }

  return {
    owns(text: string): boolean {
      // Product-intent commands belong to the products and must reach the bridge.
      return router.isCommand(text) && !shouldBridgeTelegramProductIntentCommand(text);
    },

    async handle(
      commandInput: TelegramCommandPortInput,
    ): Promise<TelegramCommandPortReply | null> {
      const chatState = await input.chatStore.read();
      const binding = commandInput.binding;
      const cat = binding ? findBindingChatCat(chatState, binding) : null;

      const result = await router.dispatch(commandInput.text, {
        chatId: commandInput.chatId,
        senderName: commandInput.senderName,
        botName: binding?.botName ?? 'CatsBot',
        catName: cat?.name ?? null,
        catId: cat?.id ?? null,
        currentMode: cat ? resolveInteractionMode(cat) : null,
        inboundMode: binding?.inboundMode ?? null,
        locale: commandInput.locale,
        delegation: await resolveDelegation(binding?.id ?? null),
        setMode: cat?.id
          ? async (mode) => setInteractionMode(input.chatStore, cat.id, mode)
          : undefined,
        setPresence: cat?.id && input.setCatPresence
          ? async (presence) => input.setCatPresence!(cat.id, presence)
          : undefined,
      });
      return result?.handled ? { replyText: result.replyText } : null;
    },
  };
}
