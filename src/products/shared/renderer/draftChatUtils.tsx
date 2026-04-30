import {
  buildExecutionLabel,
  resolveExecutionTargetLabel,
} from '../../../shared/executionLabel.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import type { RuntimeSessionPolicy } from '../../../shared/runtimeSessionPolicy.js';
import type { DraftRoomWorkflowShape } from '../../../shared/roomRouting.js';
import {
  PRODUCT_PROVIDER_ORDER,
  getDefaultModel,
  getDefaultProviderInstance,
} from '../../../shared/providerCatalog.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type AssistantPresetRecord = NonNullable<AppShellPayload['assistantPresets']>[number];
type DraftChatTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultDraftChatTranslator = createTranslator('en');

export interface DraftTemporaryParticipant {
  participantId: string;
  presetId?: string | null;
  name: string;
  provider: string;
  instance?: string;
  model?: string;
  modelSelection?: ProviderModelSelection | null;
  roleHint?: string;
}

export interface DraftParticipantPolicyDials {
  autonomy?: 'none' | 'single_step' | 'milestone_plan' | 'outcome_delegation';
  toolScope?: 'none' | 'read_only' | 'narrow_write' | 'broad_write';
  approvalThreshold?: 'low' | 'medium' | 'high';
  bootstrapTreatment?: 'default' | 'strong_agent' | 'weak_worker' | null;
}

export interface DraftParticipantCapabilityReview {
  capabilityLabel: string;
  executionLabel: string;
  policySummary: string;
  toolGrantSummary: string;
  requiresActivationReview: boolean;
  reviewReasons: string[];
}

type ResolvedDraftParticipantPolicyDials = Required<
  Pick<DraftParticipantPolicyDials, 'autonomy' | 'toolScope' | 'approvalThreshold'>
>;

export const DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT = 2;

type DraftParticipantTarget = {
  provider: string;
  model?: string | null;
  instance?: string | null;
  modelSelection?: ProviderModelSelection | null;
};

function toDraftTemporaryParticipantTarget(input: DraftParticipantTarget): {
  provider: string;
  model: string | undefined;
  instance: string | undefined;
  modelSelection: ProviderModelSelection | null;
} {
  const provider = input.provider.trim();
  return {
    provider,
    model: input.model === undefined
      ? (getDefaultModel(provider) || undefined)
      : (input.model?.trim() || undefined),
    instance: input.instance === undefined
      ? (getDefaultProviderInstance(provider) || undefined)
      : (input.instance?.trim() || undefined),
    modelSelection: input.modelSelection ?? null,
  };
}

export function buildDraftParticipantExecutionLabel(participant: {
  provider: string;
  instance?: string | null;
  model?: string | null;
}): string {
  return resolveExecutionTargetLabel({
    provider: participant.provider,
    instance: participant.instance ?? null,
    model: participant.model ?? null,
  });
}

function resolveDraftCapabilityLabel(
  bootstrapTreatment: DraftParticipantPolicyDials['bootstrapTreatment'],
  t: DraftChatTranslator,
): string {
  return bootstrapTreatment === 'strong_agent'
    ? t(messageKeys.chatDraftParticipantCapabilityStrongAgent)
    : t(messageKeys.chatDraftParticipantCapabilityConservativeAgent);
}

function buildReviewReasons(
  policyDials: ResolvedDraftParticipantPolicyDials,
  t: DraftChatTranslator,
): string[] {
  const reasons: string[] = [];
  if (policyDials.toolScope === 'broad_write') {
    reasons.push(t(messageKeys.chatDraftParticipantReviewReasonBroadWrite));
  }
  if (policyDials.autonomy === 'outcome_delegation') {
    reasons.push(t(messageKeys.chatDraftParticipantReviewReasonOutcomeDelegation));
  }
  if (policyDials.approvalThreshold === 'high') {
    reasons.push(t(messageKeys.chatDraftParticipantReviewReasonHighApproval));
  }
  return reasons;
}

function labelDraftAutonomy(
  autonomy: ResolvedDraftParticipantPolicyDials['autonomy'],
  t: DraftChatTranslator,
): string {
  switch (autonomy) {
    case 'none':
      return t(messageKeys.chatDraftParticipantAutonomyNone);
    case 'single_step':
      return t(messageKeys.chatDraftParticipantAutonomySingleStep);
    case 'milestone_plan':
      return t(messageKeys.chatDraftParticipantAutonomyMilestonePlan);
    case 'outcome_delegation':
      return t(messageKeys.chatDraftParticipantAutonomyOutcomeDelegation);
  }
}

function labelDraftToolScope(
  toolScope: ResolvedDraftParticipantPolicyDials['toolScope'],
  t: DraftChatTranslator,
): string {
  switch (toolScope) {
    case 'none':
      return t(messageKeys.chatDraftParticipantToolScopeNone);
    case 'read_only':
      return t(messageKeys.chatDraftParticipantToolScopeReadOnly);
    case 'narrow_write':
      return t(messageKeys.chatDraftParticipantToolScopeNarrowWrite);
    case 'broad_write':
      return t(messageKeys.chatDraftParticipantToolScopeBroadWrite);
  }
}

function labelDraftApprovalThreshold(
  threshold: ResolvedDraftParticipantPolicyDials['approvalThreshold'],
  t: DraftChatTranslator,
): string {
  switch (threshold) {
    case 'low':
      return t(messageKeys.chatDraftParticipantApprovalThresholdLow);
    case 'medium':
      return t(messageKeys.chatDraftParticipantApprovalThresholdMedium);
    case 'high':
      return t(messageKeys.chatDraftParticipantApprovalThresholdHigh);
  }
}

export function buildDraftParticipantCapabilityReview(
  participant: {
    provider: string;
    instance?: string | null;
    model?: string | null;
  },
  policyDials: DraftParticipantPolicyDials = {},
  t: DraftChatTranslator = defaultDraftChatTranslator,
): DraftParticipantCapabilityReview {
  const isStrongAgent = policyDials.bootstrapTreatment === 'strong_agent';
  const capabilityLabel = resolveDraftCapabilityLabel(policyDials.bootstrapTreatment, t);
  const resolvedPolicyDials: ResolvedDraftParticipantPolicyDials = {
    autonomy: policyDials.autonomy
      ?? (isStrongAgent ? 'milestone_plan' : 'single_step'),
    toolScope: policyDials.toolScope ?? 'read_only',
    approvalThreshold: policyDials.approvalThreshold ?? 'low',
  };
  const reviewReasons = buildReviewReasons(resolvedPolicyDials, t);

  return {
    capabilityLabel,
    executionLabel: buildDraftParticipantExecutionLabel(participant),
    policySummary: t(messageKeys.chatDraftParticipantPolicySummary, {
      autonomy: labelDraftAutonomy(resolvedPolicyDials.autonomy, t),
      approvalThreshold: labelDraftApprovalThreshold(resolvedPolicyDials.approvalThreshold, t),
    }),
    toolGrantSummary: t(messageKeys.chatDraftParticipantToolGrantSummary, {
      toolScope: labelDraftToolScope(resolvedPolicyDials.toolScope, t),
    }),
    requiresActivationReview: reviewReasons.length > 0,
    reviewReasons,
  };
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

function resolveTemporaryParticipantName(
  input: {
    name?: string | null;
    provider: string;
    instance?: string | null;
  },
  takenNames?: ReadonlyArray<string>,
): string {
  const explicitName = input.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  const baseName = buildExecutionLabel(
    input.provider,
    input.instance ?? null,
    null,
  ).replace(/\s+\u00b7.*$/u, '').trim();
  const normalizedTakenNames = new Set(
    (takenNames ?? []).map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0),
  );

  if (!normalizedTakenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (normalizedTakenNames.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
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
        instance: options.instance,
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

export function createInitialGroupParticipants(
  baseTarget: DraftParticipantTarget,
  maxParticipants: number = DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT,
): DraftTemporaryParticipant[] {
  const normalizedBaseTarget = toDraftTemporaryParticipantTarget(baseTarget);
  const cappedMaxParticipants = Number.isFinite(maxParticipants)
    ? Math.max(0, maxParticipants)
    : DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT;
  const targetCount = Math.min(DEFAULT_GROUP_DRAFT_PARTICIPANT_COUNT, cappedMaxParticipants);
  const providerSequence = [
    normalizedBaseTarget.provider,
    ...PRODUCT_PROVIDER_ORDER.filter((provider) => provider !== normalizedBaseTarget.provider),
  ].slice(0, targetCount);

  const takenNames: string[] = [];
  return providerSequence.map((provider, index) => {
    const participant = index === 0
      ? createDraftTemporaryParticipant({
          provider: normalizedBaseTarget.provider,
          instance: normalizedBaseTarget.instance,
          model: normalizedBaseTarget.model,
          modelSelection: normalizedBaseTarget.modelSelection,
          takenNames,
          randomUUID: () => globalThis.crypto?.randomUUID?.() ?? `temp-${provider}-${Date.now()}`,
        })
      : createDraftTemporaryParticipant({
          provider,
          instance: getDefaultProviderInstance(provider),
          model: getDefaultModel(provider) || undefined,
          modelSelection: null,
          takenNames,
          randomUUID: () => globalThis.crypto?.randomUUID?.() ?? `temp-${provider}-${Date.now()}`,
        });
    takenNames.push(participant.name);
    return participant;
  });
}

function isAutoNamedDraftTemporaryParticipant(input: {
  participant: Pick<DraftTemporaryParticipant, 'name' | 'provider' | 'instance'>;
  siblingNames: ReadonlyArray<string>;
}): boolean {
  return input.participant.name === resolveTemporaryParticipantName(
    {
      provider: input.participant.provider,
      instance: input.participant.instance ?? null,
    },
    input.siblingNames,
  );
}

export function syncLeadDraftTemporaryParticipantWithTarget(input: {
  participants: DraftTemporaryParticipant[];
  target: DraftParticipantTarget;
}): DraftTemporaryParticipant[] {
  if (input.participants.length === 0) {
    return input.participants;
  }

  const [leadParticipant, ...restParticipants] = input.participants;
  if (leadParticipant.presetId) {
    return input.participants;
  }

  const normalizedTarget = toDraftTemporaryParticipantTarget(input.target);
  const siblingNames = restParticipants.map((participant) => participant.name);
  const nextName = isAutoNamedDraftTemporaryParticipant({
    participant: leadParticipant,
    siblingNames,
  })
    ? resolveTemporaryParticipantName(
        {
          provider: normalizedTarget.provider,
          instance: normalizedTarget.instance ?? null,
        },
        siblingNames,
      )
    : leadParticipant.name;
  const nextLeadParticipant: DraftTemporaryParticipant = {
    ...leadParticipant,
    name: nextName,
    provider: normalizedTarget.provider,
    instance: normalizedTarget.instance,
    model: normalizedTarget.model,
    modelSelection: normalizedTarget.modelSelection,
  };

  if (
    nextLeadParticipant.name === leadParticipant.name
    && nextLeadParticipant.provider === leadParticipant.provider
    && (nextLeadParticipant.instance ?? null) === (leadParticipant.instance ?? null)
    && (nextLeadParticipant.model ?? null) === (leadParticipant.model ?? null)
    && JSON.stringify(nextLeadParticipant.modelSelection ?? null)
      === JSON.stringify(leadParticipant.modelSelection ?? null)
  ) {
    return input.participants;
  }

  return [nextLeadParticipant, ...restParticipants];
}

export function createNextGroupTemporaryParticipant(options: {
  baseProvider: string;
  existingParticipants: ReadonlyArray<Pick<DraftTemporaryParticipant, 'provider' | 'name'>>;
  takenNames?: ReadonlyArray<string>;
  randomUUID?: () => string;
}): DraftTemporaryParticipant {
  const normalizedBaseProvider =
    options.baseProvider.trim() || PRODUCT_PROVIDER_ORDER[0] || 'claude';
  const providerPriority = [
    normalizedBaseProvider,
    ...PRODUCT_PROVIDER_ORDER.filter((provider) => provider !== normalizedBaseProvider),
  ];
  const providerCounts = new Map(providerPriority.map((provider) => [provider, 0]));

  options.existingParticipants.forEach((participant) => {
    const provider = participant.provider.trim();
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
  });

  const nextProvider = providerPriority.reduce((selected, provider) => {
    if (!selected) {
      return provider;
    }
    return (providerCounts.get(provider) ?? 0) < (providerCounts.get(selected) ?? 0)
      ? provider
      : selected;
  }, providerPriority[0] ?? PRODUCT_PROVIDER_ORDER[0] ?? normalizedBaseProvider);

  return createDraftTemporaryParticipant({
    provider: nextProvider,
    instance: getDefaultProviderInstance(nextProvider),
    model: getDefaultModel(nextProvider) || undefined,
    modelSelection: null,
    takenNames: options.takenNames ?? options.existingParticipants.map((participant) => participant.name),
    randomUUID: options.randomUUID,
  });
}

export function resolveGenericDraftTemporaryParticipants(
  preset: 'default' | 'group' | 'parallel',
  existingParticipants: DraftTemporaryParticipant[],
  createGroupParticipants: () => DraftTemporaryParticipant[],
  options: {
    autoSeedGroupParticipants?: boolean;
  } = {},
): DraftTemporaryParticipant[] {
  if (preset !== 'group') {
    return [];
  }

  if (options.autoSeedGroupParticipants === false) {
    return existingParticipants;
  }

  return existingParticipants.length > 0
    ? existingParticipants
    : createGroupParticipants();
}

function applyDraftAudienceLimit(
  participantIds: readonly string[],
  maxAudienceParticipants?: number | null,
): string[] {
  if (!Number.isFinite(maxAudienceParticipants)) {
    return [...participantIds];
  }

  const limit = Math.max(1, Math.trunc(maxAudienceParticipants ?? Number.POSITIVE_INFINITY));
  return participantIds.slice(0, limit);
}

export function resolveDraftAudienceParticipantIds(options: {
  draftParticipantCatIds: readonly string[];
  draftTemporaryParticipants: ReadonlyArray<Pick<DraftTemporaryParticipant, 'participantId'>>;
  draftAudienceKeys?: readonly string[] | null;
  maxAudienceParticipants?: number | null;
}): string[] {
  const allParticipants = [
    ...options.draftParticipantCatIds.map((catId) => ({
      key: `cat:${catId}`,
      participantId: catId,
    })),
    ...options.draftTemporaryParticipants.map((participant) => ({
      key: `temp:${participant.participantId}`,
      participantId: participant.participantId,
    })),
  ];
  if (!options.draftAudienceKeys) {
    return applyDraftAudienceLimit(
      allParticipants.map((participant) => participant.participantId),
      options.maxAudienceParticipants,
    );
  }

  const participantIdsByKey = new Map(
    allParticipants.map((participant) => [participant.key, participant.participantId]),
  );
  const seenParticipantIds = new Set<string>();
  const resolvedAudience = options.draftAudienceKeys
    .map((key) => participantIdsByKey.get(key))
    .filter((participantId): participantId is string => Boolean(participantId))
    .filter((participantId) => {
      if (seenParticipantIds.has(participantId)) {
        return false;
      }
      seenParticipantIds.add(participantId);
      return true;
    });

  if (resolvedAudience.length > 0) {
    return applyDraftAudienceLimit(resolvedAudience, options.maxAudienceParticipants);
  }

  return allParticipants[0]?.participantId ? [allParticipants[0].participantId] : [];
}

export function reconcileDraftAudienceKeysAfterParticipantRemoval(options: {
  draftAudienceKeys: readonly string[] | null;
  previousParticipantKeys: readonly string[];
  nextParticipantKeys: readonly string[];
  removedParticipantKey: string;
  maxAudienceParticipants?: number;
}): string[] | null {
  const effectiveAudienceKeys = options.draftAudienceKeys
    ?? (Number.isFinite(options.maxAudienceParticipants)
      ? options.previousParticipantKeys.slice(0, options.maxAudienceParticipants)
      : options.previousParticipantKeys);

  const previousParticipantKeySet = new Set(options.previousParticipantKeys);
  const nextParticipantKeySet = new Set(options.nextParticipantKeys);
  const normalizedAudienceKeys = effectiveAudienceKeys.filter((key, index, source) =>
    source.indexOf(key) === index && previousParticipantKeySet.has(key));
  const remainingAudienceKeys = normalizedAudienceKeys.filter((key) =>
    key !== options.removedParticipantKey && nextParticipantKeySet.has(key));

  if (remainingAudienceKeys.length === 0) {
    return options.nextParticipantKeys[0] ? [options.nextParticipantKeys[0]] : [];
  }
  return remainingAudienceKeys;
}

export interface DraftParallelTarget {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
  executionLabel?: string | null;
  cwd?: string | null;
  runtimeSessionPolicy?: RuntimeSessionPolicy | null;
  audienceKeys?: string[] | null;
  workflowShape?: DraftRoomWorkflowShape | null;
  promptOverride?: string | null;
  attachmentsOverride?: DraftAttachmentRef[] | null;
}

export interface DraftAttachmentRef {
  name?: string | null;
  relativePath: string;
}

export function createDefaultParallelTargetForProvider(provider: string): DraftParallelTarget {
  return {
    provider,
    model: getDefaultModel(provider) || null,
    instance: getDefaultProviderInstance(provider),
    modelSelection: null,
  };
}

export function createInitialParallelTargets(
  baseTarget: DraftParallelTarget,
  options: {
    includeCompareTarget?: boolean;
  } = {},
): DraftParallelTarget[] {
  if (options.includeCompareTarget === false) {
    return [baseTarget];
  }

  const fallbackProvider = PRODUCT_PROVIDER_ORDER.find((provider) => provider !== baseTarget.provider)
    ?? 'codex';

  return [
    baseTarget,
    createDefaultParallelTargetForProvider(fallbackProvider),
  ];
}

export function syncLeadParallelTarget(
  currentTargets: DraftParallelTarget[],
  leadTarget: DraftParallelTarget,
): DraftParallelTarget[] {
  if (currentTargets.length === 0) {
    return currentTargets;
  }

  const currentLeadTarget = currentTargets[0];
  if (
    currentLeadTarget?.provider === leadTarget.provider
    && (currentLeadTarget.instance ?? null) === (leadTarget.instance ?? null)
    && (currentLeadTarget.model ?? null) === (leadTarget.model ?? null)
    && JSON.stringify(currentLeadTarget.modelSelection ?? null)
      === JSON.stringify(leadTarget.modelSelection ?? null)
  ) {
    return currentTargets;
  }

  return [
    {
      provider: leadTarget.provider,
      model: leadTarget.model,
      instance: leadTarget.instance,
      modelSelection: leadTarget.modelSelection,
    },
    ...currentTargets.slice(1),
  ];
}

export function createNextParallelTarget(
  currentTargets: DraftParallelTarget[],
  fallbackTarget: DraftParallelTarget,
): DraftParallelTarget {
  const nextProvider = PRODUCT_PROVIDER_ORDER.find((provider) =>
    !currentTargets.some((target) => target.provider === provider),
  ) ?? PRODUCT_PROVIDER_ORDER.find((provider) => provider !== fallbackTarget.provider)
    ?? fallbackTarget.provider;

  if (nextProvider === fallbackTarget.provider) {
    return {
      provider: fallbackTarget.provider,
      model: fallbackTarget.model,
      instance: fallbackTarget.instance,
      modelSelection: fallbackTarget.modelSelection,
    };
  }

  return createDefaultParallelTargetForProvider(nextProvider);
}

export function draftHasAssistantPresetParticipant(
  draftTemporaryParticipants: readonly DraftTemporaryParticipant[],
  assistantPresetId: string,
): boolean {
  return draftTemporaryParticipants.some((participant) => participant.presetId === assistantPresetId);
}

const DRAFT_GREETING_LINE_KEYS = [
  messageKeys.chatNewChatDraftDefaultGreeting,
  messageKeys.chatNewChatDraftGreetingNap,
  messageKeys.chatNewChatDraftGreetingKeyboard,
  messageKeys.chatNewChatDraftGreetingLetsGo,
  messageKeys.chatNewChatDraftGreetingStandby,
  messageKeys.chatNewChatDraftGreetingTaskReady,
  messageKeys.chatNewChatDraftGreetingOnDuty,
];

function normalizeGreetingPool(pool: ReadonlyArray<string> | null | undefined): string[] {
  return (pool ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function pickDraftGreeting(options: {
  pool?: ReadonlyArray<string> | null;
  random?: () => number;
  t?: DraftChatTranslator;
} = {}): string {
  const normalizedPool = normalizeGreetingPool(options.pool);
  const fallbackPool = DRAFT_GREETING_LINE_KEYS.map((key) =>
    (options.t ?? defaultDraftChatTranslator)(key));
  const activePool = normalizedPool.length > 0 ? normalizedPool : fallbackPool;
  const random = options.random ?? Math.random;
  return activePool[Math.floor(random() * activePool.length)]!;
}
