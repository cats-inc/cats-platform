/**
 * Owner-visible message rendering for the golden path (SPEC-114 FR-15, FR-27,
 * FR-34, FR-37, FR-44).
 *
 * One rule governs everything here: a payload may contain a summary and
 * *safely transportable references* only. Local filesystem paths, credentials,
 * and raw provider output never appear, because Telegram cannot act on them and
 * putting them in a chat message leaks the operator's machine layout.
 *
 * Text is localized at render time rather than at send time, so the durable
 * outbox row holds exactly what the owner will read and a retry after a restart
 * cannot silently change language.
 */

import type { CoreDeliveryGate, CoreDeliveryMode } from '../../../core/types.js';
import {
  createTranslator,
  messageKeys,
  normalizeMessageLocale,
  type MessageKey,
} from '../../../shared/i18n/index.js';
import type {
  TransportWorkAction,
  TransportWorkDeliveryPayload,
  TransportWorkPayloadAction,
  TransportWorkProposalV1,
  TransportWorkReadiness,
  TransportWorkReadinessReason,
} from '../../../platform/transports/work-delivery/contracts.js';
import type { WorkCompletionEvidenceResult } from '../state/workCompletionEvidence.js';

/** Cap so one message cannot become a transcript dump. */
const MAX_SUMMARY_CHARS = 600;

export type WorkGoldenPathTranslator = ReturnType<typeof createTranslator>;

export function createWorkGoldenPathTranslator(
  locale: string | null,
): WorkGoldenPathTranslator {
  return createTranslator(normalizeMessageLocale(locale));
}

function truncate(value: string, limit = MAX_SUMMARY_CHARS): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

export const READINESS_REASON_KEYS: Record<TransportWorkReadinessReason, MessageKey> = {
  binding_disabled: messageKeys.workDeliveryReadinessBindingDisabled,
  binding_unhealthy: messageKeys.workDeliveryReadinessBindingUnhealthy,
  owner_not_authorized: messageKeys.workDeliveryReadinessOwnerNotAuthorized,
  cat_not_bound: messageKeys.workDeliveryReadinessCatNotBound,
  execution_target_missing: messageKeys.workDeliveryReadinessExecutionTargetMissing,
  capability_profile_missing: messageKeys.workDeliveryReadinessCapabilityProfileMissing,
  workspace_missing: messageKeys.workDeliveryReadinessWorkspaceMissing,
  workspace_unreachable: messageKeys.workDeliveryReadinessWorkspaceUnreachable,
  workspace_not_a_repository: messageKeys.workDeliveryReadinessWorkspaceNotARepository,
  delivery_policy_unresolved: messageKeys.workDeliveryReadinessDeliveryPolicyUnresolved,
  background_service_unavailable:
    messageKeys.workDeliveryReadinessBackgroundServiceUnavailable,
};

export const DELIVERY_MODE_KEYS: Record<CoreDeliveryMode, MessageKey> = {
  artifact_only: messageKeys.sharedOperatorDeliveryModeArtifactOnly,
  commit_only: messageKeys.sharedOperatorDeliveryModeCommitOnly,
  push_branch: messageKeys.sharedOperatorDeliveryModePushBranch,
  pr_with_checks: messageKeys.sharedOperatorDeliveryModePrWithChecks,
  deploy_preview: messageKeys.sharedOperatorDeliveryModeDeployPreview,
};

const DELIVERY_GATE_KEYS: Record<CoreDeliveryGate, MessageKey> = {
  manual_review_required: messageKeys.sharedOperatorGateManualReviewRequired,
  owner_approval_required: messageKeys.sharedOperatorGateOwnerApprovalRequired,
  publish_artifact_required: messageKeys.sharedOperatorGatePublishArtifactRequired,
};

const SIDE_EFFECT_KEYS: Record<CoreDeliveryMode, MessageKey> = {
  artifact_only: messageKeys.workDeliverySideEffectsArtifactOnly,
  commit_only: messageKeys.workDeliverySideEffectsCommitOnly,
  push_branch: messageKeys.workDeliverySideEffectsPushBranch,
  pr_with_checks: messageKeys.workDeliverySideEffectsPrWithChecks,
  deploy_preview: messageKeys.workDeliverySideEffectsDeployPreview,
};

const ACTION_LABEL_KEYS: Partial<Record<TransportWorkAction, MessageKey>> = {
  start_work: messageKeys.workDeliveryActionStartWork,
  cancel: messageKeys.workDeliveryActionCancel,
};

export function describeDeliverySideEffectsLocalized(
  t: WorkGoldenPathTranslator,
  mode: CoreDeliveryMode,
): string {
  return t(SIDE_EFFECT_KEYS[mode]);
}

export function localizeTransportWorkAction(
  t: WorkGoldenPathTranslator,
  action: TransportWorkAction,
): string {
  const key = ACTION_LABEL_KEYS[action];
  return key ? t(key) : action;
}

/**
 * Authenticated Desktop entry point for a work item.
 *
 * A route, never a filesystem path: the Desktop host resolves it against the
 * owner's session, so it carries no authority on its own.
 */
export function buildWorkGoldenPathDeepLink(workItemId: string): string {
  return `cats://work/items/${encodeURIComponent(workItemId)}`;
}

function renderGates(
  t: WorkGoldenPathTranslator,
  gates: readonly CoreDeliveryGate[],
): string {
  return gates.length === 0
    ? t(messageKeys.workDeliveryValueNone)
    : gates.map((gate) => t(DELIVERY_GATE_KEYS[gate])).join(', ');
}

export function renderAcceptedMessage(input: {
  t: WorkGoldenPathTranslator;
  workItemId: string;
  goal: string;
}): TransportWorkDeliveryPayload {
  return {
    text: [
      input.t(messageKeys.workDeliveryAcceptedTitle, { goal: truncate(input.goal, 160) }),
      input.t(messageKeys.workDeliveryAcceptedBody),
    ].join('\n'),
    deepLink: buildWorkGoldenPathDeepLink(input.workItemId),
    actions: [],
  };
}

export function renderNotReadyMessage(input: {
  t: WorkGoldenPathTranslator;
  readiness: TransportWorkReadiness;
}): TransportWorkDeliveryPayload {
  return {
    text: [
      input.t(messageKeys.workDeliveryNotReadyTitle),
      ...input.readiness.blockers.map(
        (blocker) => `- ${input.t(READINESS_REASON_KEYS[blocker.reason])}`,
      ),
      input.t(messageKeys.workDeliveryNotReadyFooter),
    ].join('\n'),
    deepLink: null,
    actions: [],
  };
}

export function renderProposalMessage(input: {
  t: WorkGoldenPathTranslator;
  workItemId: string;
  proposal: TransportWorkProposalV1;
  actions: readonly TransportWorkPayloadAction[];
}): TransportWorkDeliveryPayload {
  const { t, proposal } = input;
  const lines = [
    t(messageKeys.workDeliveryProposalTitle, { revision: String(proposal.revision) }),
    t(messageKeys.workDeliveryProposalGoal, { goal: truncate(proposal.goal, 200) }),
    // The label, not the workspace path: FR-44.
    t(messageKeys.workDeliveryProposalTarget, { target: proposal.targetLabel }),
    t(messageKeys.workDeliveryProposalDoneWhen, {
      criteria: proposal.acceptanceCriteria.join('; ')
        || t(messageKeys.workDeliveryValueNotSpecified),
    }),
    t(messageKeys.workDeliveryProposalDelivery, {
      mode: t(DELIVERY_MODE_KEYS[proposal.deliveryMode]),
    }),
    t(messageKeys.workDeliveryProposalSideEffects, {
      effects: proposal.sideEffects.join(' ') || t(messageKeys.workDeliveryValueNone),
    }),
    t(messageKeys.workDeliveryProposalGates, { gates: renderGates(t, proposal.deliveryGates) }),
  ];
  if (proposal.openQuestion !== null) {
    lines.push(t(messageKeys.workDeliveryProposalQuestion, { question: proposal.openQuestion }));
  }
  lines.push(t(messageKeys.workDeliveryProposalConfirm));
  return {
    text: lines.join('\n'),
    deepLink: buildWorkGoldenPathDeepLink(input.workItemId),
    actions: [...input.actions],
  };
}

export function renderProgressMessage(input: {
  t: WorkGoldenPathTranslator;
  workItemId: string;
  stageKey: MessageKey;
  milestoneKey: MessageKey;
}): TransportWorkDeliveryPayload {
  return {
    text: input.t(messageKeys.workDeliveryProgress, {
      stage: input.t(input.stageKey),
      milestone: input.t(input.milestoneKey),
    }),
    deepLink: buildWorkGoldenPathDeepLink(input.workItemId),
    actions: [],
  };
}

export function renderDecisionMessage(input: {
  t: WorkGoldenPathTranslator;
  workItemId: string;
  reason: string;
  consequence: string;
}): TransportWorkDeliveryPayload {
  return {
    text: [
      input.t(messageKeys.workDeliveryDecisionTitle),
      input.t(messageKeys.workDeliveryDecisionReason, { reason: truncate(input.reason, 240) }),
      input.t(messageKeys.workDeliveryDecisionConsequence, {
        consequence: truncate(input.consequence, 240),
      }),
    ].join('\n'),
    deepLink: buildWorkGoldenPathDeepLink(input.workItemId),
    actions: [],
  };
}

export function renderResultMessage(input: {
  t: WorkGoldenPathTranslator;
  workItemId: string;
  proposal: TransportWorkProposalV1;
  summary: string;
  evidence: WorkCompletionEvidenceResult;
  commitId: string | null;
  artifactTitle: string | null;
  outstandingGates: readonly CoreDeliveryGate[];
  /** Inline decision actions, when the result still needs one (FR-41). */
  actions?: readonly TransportWorkPayloadAction[];
}): TransportWorkDeliveryPayload {
  const { t } = input;
  const lines = [
    t(messageKeys.workDeliveryResultTitle, { goal: truncate(input.proposal.goal, 160) }),
    truncate(input.summary),
    t(messageKeys.workDeliveryProposalDelivery, {
      mode: t(DELIVERY_MODE_KEYS[input.proposal.deliveryMode]),
    }),
  ];
  if (input.commitId !== null) {
    lines.push(t(messageKeys.workDeliveryResultCommit, { commitId: input.commitId }));
  }
  if (input.artifactTitle !== null) {
    // The title and the Desktop link, never the artifact's local path.
    lines.push(t(messageKeys.workDeliveryResultArtifact, { title: input.artifactTitle }));
  }
  lines.push(
    input.evidence.accepted
      ? t(messageKeys.workDeliveryResultAcceptanceMet)
      : t(messageKeys.workDeliveryResultAcceptanceUnmet, {
        gaps: input.evidence.gaps.join(', '),
      }),
  );
  if (input.outstandingGates.length > 0) {
    lines.push(t(messageKeys.workDeliveryResultWaitingOn, {
      gates: renderGates(t, input.outstandingGates),
    }));
  }
  return {
    text: lines.join('\n'),
    deepLink: buildWorkGoldenPathDeepLink(input.workItemId),
    actions: [...(input.actions ?? [])],
  };
}

export function renderRefusalMessage(input: {
  t: WorkGoldenPathTranslator;
  reasonKey: MessageKey;
  values?: Record<string, string>;
}): TransportWorkDeliveryPayload {
  return {
    text: input.t(input.reasonKey, input.values),
    deepLink: null,
    actions: [],
  };
}

/**
 * Last line of defence before a payload reaches a transport.
 *
 * The renderers above are careful, but "careful" is not a guarantee once a
 * summary can come from a provider. This rejects the two classes of content
 * that must never leave the host.
 */
export function assertSafeTransportPayload(payload: TransportWorkDeliveryPayload): void {
  const unsafePath = /(^|\s)(\/(Users|home|var|tmp|etc)\/|[A-Za-z]:\\)/u;
  if (unsafePath.test(payload.text)) {
    throw new Error('Refusing to send a transport payload containing a local filesystem path.');
  }
  const secretLike = /\b(bot[_-]?token|api[_-]?key|secret|bearer\s+[\w.-]{10,})\b/iu;
  if (secretLike.test(payload.text)) {
    throw new Error('Refusing to send a transport payload containing credential-like content.');
  }
}
