import {
  buildExecutionLabel,
  resolveExecutionTargetLabel,
} from '../../../shared/executionLabel.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import {
  PRODUCT_PROVIDER_ORDER,
  getDefaultModel,
  getDefaultProviderInstance,
} from '../../../shared/providerCatalog.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';

type AssistantPresetRecord = NonNullable<AppShellPayload['assistantPresets']>[number];

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
): DraftTemporaryParticipant[] {
  if (preset !== 'group') {
    return [];
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
}

export function createDefaultParallelTargetForProvider(provider: string): DraftParallelTarget {
  return {
    provider,
    model: getDefaultModel(provider) || null,
    instance: getDefaultProviderInstance(provider),
    modelSelection: null,
  };
}

export function createInitialParallelTargets(baseTarget: DraftParallelTarget): DraftParallelTarget[] {
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

export const DRAFT_GREETING_LINES = [
  'Meow. Ready when you are.',
  'Your cat hasn\'t napped yet.',
  'Cats on the keyboard.',
  'Tail up, let\'s go.',
  'Purring in standby.',
  'Claws sharpened. What\'s the task?',
  'This cat doesn\'t sleep on the job.',
];

function normalizeGreetingPool(pool: ReadonlyArray<string> | null | undefined): string[] {
  return (pool ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function pickDraftGreeting(options: {
  pool?: ReadonlyArray<string> | null;
  random?: () => number;
} = {}): string {
  const normalizedPool = normalizeGreetingPool(options.pool);
  const activePool = normalizedPool.length > 0 ? normalizedPool : DRAFT_GREETING_LINES;
  const random = options.random ?? Math.random;
  return activePool[Math.floor(random() * activePool.length)]!;
}
