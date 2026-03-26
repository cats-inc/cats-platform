import type {
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomWorkflowBranchStrategy,
  RoomWorkflowShape,
} from '../../../../shared/roomRouting.js';
import {
  buildChannelView,
  ORCHESTRATOR_NAME,
  resolveOrchestratorDisplayName,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';

export interface WorkflowRecommendationTarget {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
}

export interface WorkflowRecommendation {
  source: 'checkpoint' | 'boss_replan' | 'system_inference';
  workflowShape: RoomWorkflowShape;
  candidateTargets: WorkflowRecommendationTarget[];
  branchStrategy: RoomWorkflowBranchStrategy | null;
  rationale: string | null;
  reviewRequired: boolean;
}

export interface WorkflowRecommendationResolution {
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readWorkflowShape(value: unknown): RoomWorkflowShape | null {
  return value === 'sequential' || value === 'parallel' || value === 'converge'
    ? value
    : null;
}

function readWorkflowSource(value: unknown): WorkflowRecommendation['source'] {
  return value === 'boss_replan' || value === 'system_inference'
    ? value
    : 'checkpoint';
}

function readBranchStrategy(value: unknown): RoomWorkflowBranchStrategy | null {
  return value === 'fork_if_possible'
    || value === 'transplant_context'
    || value === 'fresh_no_parent'
    ? value
    : null;
}

function normalizeCandidateTarget(value: unknown): WorkflowRecommendationTarget | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const participantKind = record.participantKind === 'orchestrator'
    || record.participantKind === 'cat'
    ? record.participantKind
    : null;
  const participantId = readString(record.participantId);
  const participantName = readString(record.participantName)
    ?? readString(record.name);

  if (!participantId && !participantName) {
    return null;
  }

  return {
    participantKind,
    participantId,
    participantName,
  };
}

function uniqueCandidateTargets(
  targets: WorkflowRecommendationTarget[],
): WorkflowRecommendationTarget[] {
  const seen = new Set<string>();
  const normalized: WorkflowRecommendationTarget[] = [];

  for (const target of targets) {
    const key = [
      target.participantKind ?? '',
      target.participantId ?? '',
      target.participantName?.toLowerCase() ?? '',
    ].join(':');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(target);
  }

  return normalized;
}

function normalizeCandidateTargets(record: Record<string, unknown>): WorkflowRecommendationTarget[] {
  const fromTargetRecords = Array.isArray(record.candidateTargets)
    ? record.candidateTargets
        .map((target) => normalizeCandidateTarget(target))
        .filter((target): target is WorkflowRecommendationTarget => Boolean(target))
    : [];

  const fromIds = Array.isArray(record.candidateTargetIds)
    ? record.candidateTargetIds
        .map((value) => readString(value))
        .filter((value): value is string => Boolean(value))
        .map((participantId) => ({
          participantKind: null,
          participantId,
          participantName: null,
        } satisfies WorkflowRecommendationTarget))
    : [];

  const fromNames = Array.isArray(record.candidateTargetNames)
    ? record.candidateTargetNames
        .map((value) => readString(value))
        .filter((value): value is string => Boolean(value))
        .map((participantName) => ({
          participantKind: null,
          participantId: null,
          participantName,
        } satisfies WorkflowRecommendationTarget))
    : [];

  return uniqueCandidateTargets([
    ...fromTargetRecords,
    ...fromIds,
    ...fromNames,
  ]);
}

function normalizeWorkflowRecommendation(
  value: unknown,
): WorkflowRecommendation | null {
  const record = asRecord(value);
  const recommendationRecord = asRecord(record?.workflowRecommendation) ?? record;
  if (!recommendationRecord) {
    return null;
  }

  const workflowShape = readWorkflowShape(
    recommendationRecord.workflowShape ?? recommendationRecord.shape,
  );
  if (!workflowShape) {
    return null;
  }

  return {
    source: readWorkflowSource(recommendationRecord.source),
    workflowShape,
    candidateTargets: normalizeCandidateTargets(recommendationRecord),
    branchStrategy: readBranchStrategy(recommendationRecord.branchStrategy),
    rationale: readString(recommendationRecord.rationale)
      ?? readString(recommendationRecord.notes),
    reviewRequired:
      recommendationRecord.reviewRequired === true
      || workflowShape === 'converge',
  };
}

export function readWorkflowRecommendation(
  value: unknown,
): WorkflowRecommendation | null {
  return normalizeWorkflowRecommendation(value);
}

function parseWorkflowRecommendationPayload(
  value: string,
): WorkflowRecommendation | null {
  try {
    return normalizeWorkflowRecommendation(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

export function serializeWorkflowRecommendation(
  recommendation: WorkflowRecommendation,
): Record<string, unknown> {
  return {
    source: recommendation.source,
    workflowShape: recommendation.workflowShape,
    branchStrategy: recommendation.branchStrategy,
    rationale: recommendation.rationale,
    reviewRequired: recommendation.reviewRequired,
    candidateTargets: recommendation.candidateTargets.map((target) => ({
      participantKind: target.participantKind,
      participantId: target.participantId,
      participantName: target.participantName,
    })),
  };
}

export function extractWorkflowRecommendationFromBody(
  body: string,
): { body: string; recommendation: WorkflowRecommendation | null } {
  const normalizedBody = body.trim();
  if (!normalizedBody) {
    return {
      body: normalizedBody,
      recommendation: null,
    };
  }

  const directRecommendation = parseWorkflowRecommendationPayload(normalizedBody);
  if (directRecommendation) {
    return {
      body: '',
      recommendation: directRecommendation,
    };
  }

  for (const match of normalizedBody.matchAll(/```json\s*([\s\S]*?)```/giu)) {
    const recommendation = parseWorkflowRecommendationPayload(match[1] ?? '');
    if (!recommendation) {
      continue;
    }

    return {
      body: normalizedBody
        .replace(match[0], '')
        .replace(/\n{3,}/gu, '\n\n')
        .trim(),
      recommendation,
    };
  }

  return {
    body: normalizedBody,
    recommendation: null,
  };
}

function isSoloChatChannel(channel: ReturnType<typeof buildChannelView>): boolean {
  return channel.composerMode === 'solo'
    && channel.roomRouting?.mode !== 'direct_cat_chat';
}

function buildOrchestratorTarget(state: ChatState, channelId: string): RoutingTarget {
  const channel = buildChannelView(state, channelId);
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: isSoloChatChannel(channel) ? 'Chat' : resolveOrchestratorDisplayName(state),
    sessionId: channel.orchestratorLease.sessionId,
  };
}

export function resolveWorkflowRecommendationTargets(
  state: ChatState,
  channelId: string,
  recommendation: WorkflowRecommendation,
): WorkflowRecommendationResolution {
  const channel = buildChannelView(state, channelId);
  const catsById = new Map(
    channel.assignedCats
      .filter((cat) => cat.status === 'active')
      .map((cat) => [cat.catId, cat]),
  );
  const catsByName = new Map(
    channel.assignedCats
      .filter((cat) => cat.status === 'active')
      .map((cat) => [cat.name.toLowerCase(), cat]),
  );
  const orchestrator = buildOrchestratorTarget(state, channelId);
  const orchestratorAliases = new Set([
    ORCHESTRATOR_NAME.toLowerCase(),
    orchestrator.participantName.toLowerCase(),
    orchestrator.participantId,
  ]);
  const targets: RoutingTarget[] = [];
  const unresolved: string[] = [];
  const mentionNames: string[] = [];
  const seen = new Set<string>();

  for (const selector of recommendation.candidateTargets) {
    let target: RoutingTarget | null = null;
    const normalizedId = selector.participantId?.trim() ?? null;
    const normalizedName = selector.participantName?.trim() ?? null;

    if (
      selector.participantKind === 'orchestrator'
      || (normalizedId && orchestratorAliases.has(normalizedId.toLowerCase()))
      || (normalizedName && orchestratorAliases.has(normalizedName.toLowerCase()))
    ) {
      target = orchestrator;
    } else if (normalizedId && catsById.has(normalizedId)) {
      const cat = catsById.get(normalizedId)!;
      target = {
        participantKind: 'cat',
        participantId: cat.catId,
        participantName: cat.name,
        sessionId: cat.execution.lease.sessionId,
      };
    } else if (normalizedName && catsByName.has(normalizedName.toLowerCase())) {
      const cat = catsByName.get(normalizedName.toLowerCase())!;
      target = {
        participantKind: 'cat',
        participantId: cat.catId,
        participantName: cat.name,
        sessionId: cat.execution.lease.sessionId,
      };
    }

    if (!target) {
      unresolved.push(normalizedName ?? normalizedId ?? 'unknown_target');
      continue;
    }

    const key = `${target.participantKind}:${target.participantId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push(target);
    mentionNames.push(target.participantName);
  }

  return {
    targets,
    unresolved,
    mentionNames,
  };
}
