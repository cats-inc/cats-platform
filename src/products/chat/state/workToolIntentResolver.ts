import type {
  OrchestratorToolIntentResolveInput,
  ToolIntentManifest,
} from '../../../platform/orchestration/contracts.js';
import {
  WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  type WorkToolCapabilityProfile,
  type WorkToolPhase,
} from '../../work/shared/workToolSurface.js';
import {
  WORK_MCP_PROFILE_ID,
  resolvePhaseScopedWorkToolIntentManifest,
} from '../../work/shared/workToolIntent.js';
import { resolveWorkExecutionPreparationPhase } from '../../work/shared/workExecutionPreparationPhase.js';
import { resolveWorkExternalBindingPhase } from '../../work/shared/workExternalBindingPhase.js';
import { resolveWorkExternalIssueImportPhase } from '../../work/shared/workExternalIssueImportPhase.js';
import type { ChatState } from '../api/contracts.js';

interface WorkToolIntentPhaseResolution {
  phase: WorkToolPhase;
  toolNames?: string[];
}

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

const INTAKE_CUE_PATTERNS = [
  /\btodos?\b/u,
  /\bto-do\b/u,
  /\bwork\s*items?\b/u,
  /\badd\s+(?:a\s+)?task\b/u,
  /\bcapture\b/u,
  /\bremember\b/u,
  /\btrack\b/u,
  /待辦/u,
  /記一/u,
  /記下/u,
  /新增.*任務/u,
  /加入.*任務/u,
  /收進.*任務/u,
] as const;

export function resolveChatWorkToolIntentManifest(
  input: OrchestratorToolIntentResolveInput<ChatState>,
): ToolIntentManifest | null | undefined {
  if (input.profileId?.trim() !== WORK_MCP_PROFILE_ID) {
    return undefined;
  }

  const resolution = resolveWorkToolIntentPhase(input);
  if (!resolution) {
    return null;
  }

  const capabilityProfile = resolveWorkCapabilityProfile(input);
  if (resolution.phase === 'execution_preparation' && capabilityProfile !== 'boss_cat') {
    return null;
  }

  const toolScope = resolution.phase === 'intake' ? 'read_only' : 'narrow_write';
  return restrictToolIntentManifest(
    resolvePhaseScopedWorkToolIntentManifest({
      profileId: WORK_MCP_PROFILE_ID,
      phase: resolution.phase,
      capabilityProfile,
      parentToolScope: toolScope,
      policyToolScope: toolScope,
      channelId: input.channel.id,
      catId: input.catId,
      participantKind: input.participantKind,
      roomMode: input.roomMode,
      transport: input.transport,
    }),
    resolution.toolNames,
  );
}

function resolveWorkToolIntentPhase(
  input: OrchestratorToolIntentResolveInput<ChatState>,
): WorkToolIntentPhaseResolution | null {
  const externalImport = resolveWorkExternalIssueImportPhase({ rawText: input.body });
  if (externalImport.kind === 'matched') {
    return {
      phase: externalImport.phase,
      toolNames: [WORK_EXTERNAL_IMPORT_ISSUE_TOOL],
    };
  }

  const externalBinding = resolveWorkExternalBindingPhase({ rawText: input.body });
  if (externalBinding.kind === 'matched') {
    return {
      phase: externalBinding.phase,
      toolNames: [
        WORK_EXTERNAL_LINK_ISSUE_TOOL,
        WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
      ],
    };
  }

  const executionPreparation = resolveWorkExecutionPreparationPhase({
    rawText: input.body,
    addressedBossCat: isBossCatTarget(input),
  });
  if (executionPreparation.kind === 'matched') {
    return { phase: executionPreparation.phase };
  }

  if (matchesTriageIntent(input.body)) {
    return { phase: 'triage' };
  }
  if (matchesIntakeIntent(input.body)) {
    return { phase: 'intake' };
  }

  return null;
}

function restrictToolIntentManifest(
  manifest: ToolIntentManifest | null,
  toolNames: string[] | undefined,
): ToolIntentManifest | null {
  if (!manifest || !toolNames) {
    return manifest;
  }

  const allowedToolNames = new Set(toolNames);
  return {
    ...manifest,
    allowedTools: (manifest.allowedTools ?? [])
      .filter((toolName) => allowedToolNames.has(toolName)),
    toolDescriptions: (manifest.toolDescriptions ?? [])
      .filter((description) => allowedToolNames.has(description.name)),
  };
}

function resolveWorkCapabilityProfile(
  input: OrchestratorToolIntentResolveInput<ChatState>,
): WorkToolCapabilityProfile {
  return isBossCatTarget(input) ? 'boss_cat' : 'strong_agent';
}

function isBossCatTarget(input: OrchestratorToolIntentResolveInput<ChatState>): boolean {
  if (input.participantKind === 'orchestrator') {
    return true;
  }

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

function matchesIntakeIntent(rawText: string): boolean {
  const normalized = rawText.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (!normalized || normalized.startsWith('/')) {
    return false;
  }

  return INTAKE_CUE_PATTERNS.some((pattern) => pattern.test(normalized));
}
