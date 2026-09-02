/**
 * Host composition for the Telegram work-delivery golden path (SPEC-114).
 *
 * This is integration space by design: resolving readiness needs the Telegram
 * binding, the Chat product's Cat registry, the Work product's Core store, and
 * host configuration at once, and no single product owns all four.
 *
 * The whole feature is gated by `config.transportWorkGoldenPath.enabled`.
 * Rollback is turning that off: Core records and transport receipts survive, and
 * `/work` reverts to ordinary chat routing (PLAN-105 Phase 6).
 */

import type { AppConfig } from '../../config.js';
import type { CoreStore } from '../../core/store.js';
import type {
  BotBindingRecord,
  CatsCoreState,
  CoreDeliveryMode,
  ExecutionTargetSummary,
} from '../../core/types.js';
import type { TransportWorkReadiness } from '../../platform/transports/work-delivery/contracts.js';
import type { TelegramRelayContext } from '../../platform/transports/telegram/contracts.js';
import type { TelegramRelay } from '../../platform/transports/telegram/relay/index.js';
import type { TelegramPollingSupervisor } from '../../platform/transports/telegram/polling.js';
import {
  createTransportWorkOutbox,
  type TransportWorkOutbox,
} from '../../platform/transports/work-delivery/outbox.js';
import { createTransportWorkActionTokenStore } from '../../platform/transports/work-delivery/actionTokens.js';
import {
  createFileTransportWorkStateStore,
  resolveTransportWorkStatePath,
} from '../../platform/transports/work-delivery/stateStore.js';
import type { TransportWorkGoldenPathPort } from '../../platform/transports/work-delivery/port.js';
import {
  evaluateTransportWorkReadiness,
  resolveDefaultDeliveryMode,
} from '../../platform/transports/work-delivery/readiness.js';
import {
  resolveTransportWorkPermissionEnvelope,
  type TransportWorkWorkspaceCapability,
} from '../../platform/transports/work-delivery/permissionEnvelope.js';
import {
  createTransportWorkTelemetry,
  type TransportWorkTelemetrySnapshot,
} from '../../platform/transports/work-delivery/telemetry.js';
import type { ChatState } from '../../products/chat/api/contracts.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathService,
} from '../../products/work/state/workGoldenPathService.js';
import {
  createWorkGoldenPathRunner,
  type WorkGoldenPathRunner,
} from '../../products/work/state/workGoldenPathRunner.js';
import {
  createWorkGoldenPathRuntimeExecutor,
} from '../../products/work/state/workGoldenPathRuntimeExecutor.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import type { SupervisionToolScope } from '../../platform/supervision/contracts.js';
import {
  resolveProviderCapabilityBootstrapRule,
  type ProviderCapabilityBootstrapConfig,
} from '../../platform/supervision/providerCapabilityBootstrapConfig.js';
import {
  createRuntimeDeliveryClient,
  type RuntimeDeliveryClient,
} from '../../platform/runtime/deliveryClient.js';
import {
  createRuntimeEvidenceCollector,
} from '../../products/work/state/workGoldenPathDeliveryEvidence.js';
import {
  createTelegramGoldenPathOutboxSender,
  createTelegramGoldenPathPort,
  type TelegramGoldenPathContext,
} from '../../products/work/state/workGoldenPathTelegramPort.js';
import { createCatActorId } from '../../core/model/index.js';

export interface TransportWorkGoldenPathBundle {
  port: TransportWorkGoldenPathPort;
  service: WorkGoldenPathService;
  outbox: TransportWorkOutbox;
  /** Null when no runtime client is available to execute admitted work. */
  runner: WorkGoldenPathRunner | null;
  /** Desktop's read of the same readiness evaluation the transport uses. */
  readiness: TransportWorkReadinessReader;
  /** Bounded operational counters; carries no message bodies or secrets. */
  telemetry: { snapshot(): TransportWorkTelemetrySnapshot };
}

/**
 * Desktop's view of delegation readiness (SPEC-114 FR-3, gate G1).
 *
 * The transport tells the owner why a request was refused; this is the same
 * answer on the surface where the prerequisites are actually fixed.
 */
export interface TransportWorkReadinessReport {
  enabled: boolean;
  workspacePath: string | null;
  authorizedOwnerCount: number;
  localExecution: TransportWorkLocalExecutionStatus;
  bindings: Array<{
    bindingId: string;
    botName: string | null;
    deliveryMode: CoreDeliveryMode;
    toolScope: SupervisionToolScope;
    readiness: TransportWorkReadiness;
  }>;
}

export type TransportWorkLocalExecutionStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable';

export interface TransportWorkReadinessReader {
  describe(): Promise<TransportWorkReadinessReport>;
}

export interface CreateTransportWorkGoldenPathInput {
  config: AppConfig;
  chatStore: ChatStore;
  coreStore: CoreStore;
  telegramRelay: TelegramRelay;
  pollingSupervisor?: TelegramPollingSupervisor;
  readRelayContext: () => Promise<TelegramRelayContext>;
  /** Absent means admitted work is recorded but never executed. */
  runtimeClient?: RuntimeClient;
  /** Loaded provider capability bootstrap used by the rest of Chat supervision. */
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  now?: () => Date;
}

function findBinding(core: CatsCoreState, bindingId: string): BotBindingRecord | null {
  return core.botBindings.find((binding) => binding.id === bindingId) ?? null;
}

/**
 * Resolves the bound Cat's execution target.
 *
 * Returns `null` rather than a default when the Cat or its provider cannot be
 * resolved: FR-2 wants a *resolved* target, and inventing one here would make
 * the bot promise execution it cannot perform.
 */
function resolveExecutionTarget(
  state: ChatState,
  catActorId: string | null,
): ExecutionTargetSummary | null {
  if (catActorId === null) {
    return null;
  }
  const cat = state.cats.find((candidate) => createCatActorId(candidate.id) === catActorId);
  const target = cat?.defaultExecutionTarget;
  if (!target || !target.provider) {
    return null;
  }
  return {
    provider: target.provider,
    instance: target.instance ?? null,
    model: target.model ?? null,
  };
}

function describeExecutionTarget(target: ExecutionTargetSummary | null): string | null {
  if (target === null) {
    return null;
  }
  return target.model ? `${target.provider}:${target.model}` : target.provider;
}

/**
 * Asks the runtime what the configured workspace actually is.
 *
 * Returns `null` when the path is unset or the runtime cannot answer, which the
 * envelope treats as "not usable" rather than assuming the optimistic case. A
 * probe failure is a readiness blocker the owner can see, not an exception that
 * takes down intake.
 */
async function probeWorkspace(
  deliveryClient: RuntimeDeliveryClient,
  workspacePath: string | null,
): Promise<TransportWorkWorkspaceCapability | null> {
  if (workspacePath === null) {
    return null;
  }
  try {
    const snapshot = await deliveryClient.inspectRepo({ workspacePath });
    return {
      reachable: snapshot.supported,
      repository: snapshot.repository,
      clean: snapshot.clean,
      headOid: snapshot.headOid,
    };
  } catch {
    return null;
  }
}

export function resolveTransportWorkLocalExecutionStatus(input: {
  reachable: boolean;
  status: string;
}): TransportWorkLocalExecutionStatus {
  if (!input.reachable) {
    return 'unavailable';
  }
  const status = input.status.trim().toLowerCase();
  return status === 'ok' || status === 'ready' || status === 'healthy'
    ? 'healthy'
    : 'degraded';
}

export function createTransportWorkGoldenPath(
  input: CreateTransportWorkGoldenPathInput,
): TransportWorkGoldenPathBundle | null {
  // Read defensively: a host config assembled before this field existed simply
  // has the feature off, which is also the default. Throwing here would turn an
  // opt-in rollout flag into a hard boot requirement.
  const settings = input.config.transportWorkGoldenPath;
  if (!settings?.enabled) {
    return null;
  }

  // One instance shared by the outbox and the service, so a single snapshot
  // describes the whole path rather than one layer of it.
  const telemetry = createTransportWorkTelemetry();
  const transportState = createFileTransportWorkStateStore(
    resolveTransportWorkStatePath(input.config.platformStateDir),
  );

  const outbox = createTransportWorkOutbox({
    now: input.now,
    telemetry,
    store: transportState,
    send: createTelegramGoldenPathOutboxSender({
      telegramRelay: input.telegramRelay,
      resolveRelayContext: input.readRelayContext,
    }),
  });

  const deliveryClient = createRuntimeDeliveryClient({
    baseUrl: input.config.runtimeBaseUrl,
    apiKey: input.config.runtimeApiKey,
  });

  async function readLocalExecutionStatus(): Promise<TransportWorkLocalExecutionStatus> {
    if (input.runtimeClient === undefined) {
      return 'unavailable';
    }
    try {
      return resolveTransportWorkLocalExecutionStatus(await input.runtimeClient.getHealth());
    } catch {
      return 'unavailable';
    }
  }

  const service = createWorkGoldenPathService({
    coreStore: input.coreStore,
    outbox,
    tokenStore: createTransportWorkActionTokenStore({
      now: input.now,
      store: transportState,
    }),
    deliveryClient,
    telemetry,
    now: input.now,
  });

  /**
   * The single readiness evaluation, shared by Telegram admission and the
   * Desktop settings surface.
   *
   * `readiness.ts` exists so a bot cannot claim work is queued while Desktop
   * shows a missing provider. Two callers evaluating the same rules separately
   * would reintroduce exactly that, so both go through here.
   */
  async function evaluateBinding(
    bindingId: string,
    externalUserRef: string | null,
    observedLocalExecution?: TransportWorkLocalExecutionStatus,
  ) {
    const state = await input.chatStore.read();
    const core = await input.coreStore.readCore();
    const binding = findBinding(core, bindingId);
    const localExecution = observedLocalExecution ?? await readLocalExecutionStatus();
    const catActorId = binding?.catActorId ?? binding?.bossCatActorId ?? null;
    const pollingHealth = input.pollingSupervisor?.getPollingStatus(bindingId)?.health ?? null;
    const workspacePath = settings.workspacePath;
    // Observed, not claimed. The delivery-mode default used to rest on an
    // operator's `workspaceIsRepo` flag that nothing verified.
    const workspace = localExecution === 'unavailable'
      ? null
      : await probeWorkspace(deliveryClient, workspacePath);
    const deliveryMode = resolveDefaultDeliveryMode({
      workspacePath,
      isRepo: workspace?.repository ?? false,
    });
    const permission = resolveTransportWorkPermissionEnvelope({
      workspacePath,
      workspace,
      deliveryMode,
    });
    const executionTarget = resolveExecutionTarget(state, catActorId);
    const executionTargetId = describeExecutionTarget(executionTarget);
    const capabilityProfileResolved = executionTarget !== null
      && resolveProviderCapabilityBootstrapRule(
        input.providerCapabilityBootstrapConfig,
        executionTarget,
        { observedAt: (input.now?.() ?? new Date()).toISOString() },
      ).treatment !== 'default';

    const readiness = evaluateTransportWorkReadiness({
      bindingEnabled: binding?.status === 'active',
      // A webhook binding has no polling status; absence is not ill health.
      bindingHealthy: pollingHealth === null || pollingHealth === 'healthy',
      // Desktop asks about the binding rather than about one person, so it
      // passes `null` and the question becomes "is any owner authorized at all".
      ownerAuthorized: externalUserRef === null
        ? settings.authorizedOwnerRefs.length > 0
        : settings.authorizedOwnerRefs.includes(externalUserRef),
      boundCatId: catActorId,
      executionTargetId,
      // A provider target and a capability rule are separate prerequisites.
      // Treating "target exists" as "profile resolved" made the Settings
      // bootstrap blocker unreachable and let unknown providers look ready.
      capabilityProfileResolved,
      workspacePath,
      permission,
      deliveryMode,
      deliveryGates: [],
      // The platform process answering Telegram may still be alive while the
      // local runtime that executes the admitted Run is unavailable.
      backgroundServiceAvailable: localExecution !== 'unavailable',
    });

    return {
      readiness,
      permission,
      executionTarget,
      executionTargetId,
      deliveryMode,
      workspacePath,
      workspaceHeadOid: workspace?.headOid ?? null,
      ownerActorId: core.ownerProfile.actorId,
      botName: binding?.botName ?? null,
      localExecution,
      targetLabel: workspacePath === null
        ? 'no workspace'
        : workspacePath.split('/').filter(Boolean).pop() ?? workspacePath,
    };
  }

  /** Desktop's read of the same evaluation, one row per Telegram binding. */
  async function describeReadiness(): Promise<TransportWorkReadinessReport> {
    const core = await input.coreStore.readCore();
    const localExecution = await readLocalExecutionStatus();
    const bindings: TransportWorkReadinessReport['bindings'] = [];
    for (const binding of core.botBindings) {
      const evaluated = await evaluateBinding(binding.id, null, localExecution);
      bindings.push({
        bindingId: binding.id,
        botName: evaluated.botName,
        deliveryMode: evaluated.deliveryMode,
        toolScope: evaluated.permission.toolScope,
        readiness: evaluated.readiness,
      });
    }
    return {
      enabled: true,
      workspacePath: settings.workspacePath,
      authorizedOwnerCount: settings.authorizedOwnerRefs.length,
      localExecution,
      bindings,
    };
  }

  // Acceptance evidence is gathered through the runtime delivery API, which is
  // the only place allowed to touch the repository (ADR-112 layer table).
  const collectEvidence = createRuntimeEvidenceCollector({ deliveryClient });

  // Built once so the executor's per-run session map survives across steps; the
  // provider target is resolved late, at the moment a session is opened.
  const executeStep = input.runtimeClient
    ? createWorkGoldenPathRuntimeExecutor({
      runtimeClient: input.runtimeClient,
      collectEvidence,
    })
    : null;

  const runner = executeStep
    ? createWorkGoldenPathRunner({
      coreStore: input.coreStore,
      service,
      now: input.now,
      executeStep,
    })
    : null;

  const port = createTelegramGoldenPathPort({
    service,
    onRedrive: ({ runId }) => {
      if (runner === null) {
        return;
      }
      void runner.drive({ runId }).catch(() => {
        // `drive` records terminal state and notifies the owner itself.
      });
    },
    onAdmitted: ({ runId }) => {
      if (runner === null) {
        return;
      }
      // Detached on purpose (FR-14): the callback handler has already
      // acknowledged Telegram, and the run may take minutes. Failures land on
      // the Run record and in the owner's decision message, not here.
      void runner.drive({ runId }).catch(() => {
        // `drive` already records terminal state and notifies the owner; this
        // catch only stops an unhandled rejection from taking down the host.
      });
    },
    resolveContext: async ({
      bindingId,
      externalUserRef,
      goal,
    }): Promise<TelegramGoldenPathContext> => {
      // Refreshed per request so a binding, Cat, or provider change between two
      // `/work` messages is reflected instead of cached into a stale promise.
      const evaluated = await evaluateBinding(bindingId, externalUserRef);

      return {
        readiness: evaluated.readiness,
        toolScope: evaluated.permission.toolScope,
        ownerActorId: evaluated.ownerActorId,
        targetLabel: evaluated.targetLabel,
        projectId: null,
        workspacePath: evaluated.workspacePath,
        deliveryMode: evaluated.deliveryMode,
        deliveryGates: [],
        // Until the clarification loop lands, the owner's requested outcome is
        // the minimum non-vacuous criterion. An empty list would make every
        // otherwise valid commit satisfy acceptance automatically.
        acceptanceCriteria: goal.trim() === '' ? [] : [goal.trim()],
        openQuestion: null,
        executionTarget: evaluated.executionTarget,
        workspaceHeadOid: evaluated.workspaceHeadOid,
      };
    },
  });

  return {
    port,
    service,
    outbox,
    runner,
    readiness: { describe: describeReadiness },
    telemetry,
  };
}
