import { buildExecutionLabel } from '../../../shared/executionLabel.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
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

export function buildDraftParticipantExecutionLabel(participant: {
  provider: string;
  instance?: string | null;
  model?: string | null;
}): string {
  return buildExecutionLabel(
    participant.provider,
    participant.instance ?? null,
    participant.model ?? null,
  );
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
  },
  takenNames?: ReadonlyArray<string>,
): string {
  const explicitName = input.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  const baseName = buildExecutionLabel(input.provider, null, null).replace(/\s+\u00b7.*$/u, '').trim();
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
