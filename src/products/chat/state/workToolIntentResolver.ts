import type {
  OrchestratorToolIntentResolveInput,
  ToolIntentManifest,
} from '../../../platform/orchestration/contracts.js';
import type { WorkToolCapabilityProfile, WorkToolPhase } from '../../work/shared/workToolSurface.js';
import {
  WORK_MCP_PROFILE_ID,
  resolvePhaseScopedWorkToolIntentManifest,
} from '../../work/shared/workToolIntent.js';
import { resolveWorkExecutionPreparationPhase } from '../../work/shared/workExecutionPreparationPhase.js';
import { resolveWorkExternalBindingPhase } from '../../work/shared/workExternalBindingPhase.js';
import type { ChatState } from '../api/contracts.js';

const TRIAGE_CUE_PATTERNS = [
  /\bcreate\s+(?:a\s+)?project\b/u,
  /\badd\s+(?:a\s+)?project\b/u,
  /\bnew\s+project\b/u,
  /\bupdate\s+(?:the\s+)?work\s*item\b/u,
  /\bchange\s+(?:the\s+)?work\s*item\b/u,
  /\bassign\s+(?:the\s+)?work\s*item\b/u,
  /\bmove\s+(?:the\s+)?work\s*item\b/u,
  /建立.*專案/u,
  /新增.*專案/u,
  /更新.*待辦/u,
  /修改.*待辦/u,
  /指派.*專案/u,
] as const;

export function resolveChatWorkToolIntentManifest(
  input: OrchestratorToolIntentResolveInput<ChatState>,
): ToolIntentManifest | null | undefined {
  if (input.profileId?.trim() !== WORK_MCP_PROFILE_ID) {
    return undefined;
  }

  const phase = resolveWorkToolIntentPhase(input);
  if (!phase) {
    return null;
  }

  const capabilityProfile = resolveWorkCapabilityProfile(input);
  if (phase === 'execution_preparation' && capabilityProfile !== 'boss_cat') {
    return null;
  }

  return resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase,
    capabilityProfile,
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
    channelId: input.channel.id,
    catId: input.catId,
    participantKind: input.participantKind,
    roomMode: input.roomMode,
    transport: input.transport,
  });
}

function resolveWorkToolIntentPhase(
  input: OrchestratorToolIntentResolveInput<ChatState>,
): WorkToolPhase | null {
  const externalBinding = resolveWorkExternalBindingPhase({ rawText: input.body });
  if (externalBinding.kind === 'matched') {
    return externalBinding.phase;
  }

  const executionPreparation = resolveWorkExecutionPreparationPhase({
    rawText: input.body,
    addressedBossCat: isBossCatTarget(input),
  });
  if (executionPreparation.kind === 'matched') {
    return executionPreparation.phase;
  }

  if (matchesTriageIntent(input.body)) {
    return 'triage';
  }

  return null;
}

function resolveWorkCapabilityProfile(
  input: OrchestratorToolIntentResolveInput<ChatState>,
): WorkToolCapabilityProfile {
  return isBossCatTarget(input) ? 'boss_cat' : 'strong_agent';
}

function isBossCatTarget(input: OrchestratorToolIntentResolveInput<ChatState>): boolean {
  return input.participantKind === 'cat'
    && typeof input.state.bossCatId === 'string'
    && input.state.bossCatId === input.participantId;
}

function matchesTriageIntent(rawText: string): boolean {
  const normalized = rawText.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (!normalized || normalized.startsWith('/')) {
    return false;
  }

  return TRIAGE_CUE_PATTERNS.some((pattern) => pattern.test(normalized));
}
