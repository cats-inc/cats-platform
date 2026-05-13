import type {
  ProviderAgentToolDescriptor,
} from '../../../platform/orchestration/providerAgentDecision.js';
import type { SupervisionToolScope } from '../../../platform/supervision/contracts.js';
import { filterToolSurface } from '../../../platform/supervision/toolRegistry.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_CAPTURE_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  createPhaseScopedWorkToolManifests,
  filterPhaseScopedWorkToolManifests,
  type PhaseScopedWorkToolName,
  type WorkToolCapabilityProfile,
  type WorkToolPhase,
} from './workToolSurface.js';

export interface PhaseScopedWorkToolObservationInput {
  enabled?: boolean;
  phase: WorkToolPhase;
  capabilityProfile: WorkToolCapabilityProfile;
  policyToolScope: SupervisionToolScope;
  parentToolScope?: SupervisionToolScope;
}

export interface PhaseScopedWorkToolObservation {
  descriptors: ProviderAgentToolDescriptor[];
  invariants: string[];
}

const WORK_TOOL_REASON_BY_NAME: Readonly<Record<PhaseScopedWorkToolName, string>> = {
  [WORK_EXTERNAL_LINK_ISSUE_TOOL]:
    'Actor can locally link a Work Item or Project to an external tracker record.',
  [WORK_EXTERNAL_UNLINK_ISSUE_TOOL]:
    'Actor can locally remove one external tracker binding from a Work Item or Project.',
  [WORK_ITEM_ASSIGN_PROJECT_TOOL]:
    'Actor can attach one existing Work Item to one existing Project during triage.',
  [WORK_ITEM_CAPTURE_TOOL]:
    'Actor can request draft/planned Work Item capture when narrow-write policy is granted.',
  [WORK_ITEM_PREPARE_EXECUTION_TOOL]:
    'Boss Cat can propose execution preparation for selected Work Items without writing Core.',
  [WORK_ITEM_PROPOSE_SPLIT_TOOL]:
    'Actor can propose candidate Work Items from owner text without writing Core.',
  [WORK_ITEM_UPDATE_TOOL]:
    'Actor can apply bounded planning-field updates to one existing Work Item.',
  [WORK_PROJECT_CREATE_TOOL]:
    'Actor can create one bounded Project during Work triage.',
  [WORK_PROJECT_LOOKUP_TOOL]:
    'Actor can look up bounded Project candidates without writing Core.',
  [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL]:
    'Boss Cat can create a pending-approval Task from one ready Work Item.',
};

const WORK_TOOL_INPUT_HINTS_BY_NAME: Readonly<Record<PhaseScopedWorkToolName, readonly string[]>> = {
  [WORK_EXTERNAL_LINK_ISSUE_TOOL]: [
    'Input: { note?: string }. Cats re-resolves local Work refs and external tracker ids from the owner message.',
    'Do not call external tracker APIs or provide actor ids, timestamps, task ids, mission ids, or run ids.',
  ],
  [WORK_EXTERNAL_UNLINK_ISSUE_TOOL]: [
    'Input: {}. Cats re-resolves the local Work ref and external tracker id from the owner message.',
    'Do not call external tracker APIs or provide actor ids, timestamps, task ids, mission ids, or run ids.',
  ],
  [WORK_ITEM_ASSIGN_PROJECT_TOOL]: [
    'Input: { note?: string }. Cats re-resolves workItemId and projectId from the owner message.',
    'Do not create Projects, Tasks, Runs, runtime sessions, or provide actor ids or timestamps.',
  ],
  [WORK_ITEM_CAPTURE_TOOL]: [
    'Input: { title: string; summary?: string; kind?: string; priority?: string; status?: "draft" | "planned"; openQuestions?: string[] }.',
    'Do not create Projects, Tasks, Runs, runtime sessions, or provide server-resolved ids or timestamps.',
  ],
  [WORK_ITEM_PREPARE_EXECUTION_TOOL]: [
    'Input: { executionGoal?: string; maxItems?: number }. Cats selects Work Item ids from the owner-visible scope.',
    'Read-only: return proposals only and do not create Tasks, Runs, or runtime sessions.',
  ],
  [WORK_ITEM_PROPOSE_SPLIT_TOOL]: [
    'Input: { maxItems?: number; defaultKind?: string; defaultPriority?: string }. Cats supplies the owner source text.',
    'Read-only: propose candidate Work Items only; do not claim persistence.',
  ],
  [WORK_ITEM_UPDATE_TOOL]: [
    'Input: { title?: string; summary?: string; status?: "draft" | "planned" | "ready" | "blocked"; kind?: string; priority?: string; assignmentHint?: string; openQuestions?: string[] }.',
    'Cats re-resolves workItemId from the owner message. Do not create Projects, Tasks, Runs, runtime sessions, or provide actor ids or timestamps.',
  ],
  [WORK_PROJECT_CREATE_TOOL]: [
    'Input: { title: string; summary?: string; status?: "planned" | "active" | "paused"; repoPath?: string }.',
    'Cats supplies primaryConversationId. Do not create Work Items, Tasks, Runs, runtime sessions, or provide project ids, actor ids, or timestamps.',
  ],
  [WORK_PROJECT_LOOKUP_TOOL]: [
    'Input: { query?: string; limit?: number; includeArchived?: boolean }.',
    'Read-only: return bounded Project candidates only; do not write Core.',
  ],
  [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL]: [
    'Input: { title?: string; summary?: string; approvalNote?: string }. Cats selects the ready Work Item id from the confirmed execution proposal.',
    'Creates pending-approval Tasks only; do not create Runs or start runtime checkout.',
  ],
};

export function createPhaseScopedWorkToolObservation(
  input: PhaseScopedWorkToolObservationInput,
): PhaseScopedWorkToolObservation {
  if (input.enabled === false) {
    return {
      descriptors: [],
      invariants: [],
    };
  }

  const manifests = filterToolSurface(
    filterPhaseScopedWorkToolManifests(createPhaseScopedWorkToolManifests(), {
      phase: input.phase,
      capabilityProfile: input.capabilityProfile,
    }),
    {
      parentToolScope: input.parentToolScope ?? input.policyToolScope,
      policyToolScope: input.policyToolScope,
    },
  );
  const descriptors = manifests.map((manifest) => ({
    manifest,
    reason: WORK_TOOL_REASON_BY_NAME[manifest.name as PhaseScopedWorkToolName],
    inputHints: [...WORK_TOOL_INPUT_HINTS_BY_NAME[manifest.name as PhaseScopedWorkToolName]],
  }));

  return {
    descriptors,
    invariants: createPhaseScopedWorkToolInvariants(input.phase, descriptors),
  };
}

function createPhaseScopedWorkToolInvariants(
  phase: WorkToolPhase,
  descriptors: ProviderAgentToolDescriptor[],
): string[] {
  if (descriptors.length === 0) {
    return [];
  }
  const names = new Set(descriptors.map((descriptor) => descriptor.manifest.name));

  switch (phase) {
    case 'intake':
      return [
        `${WORK_ITEM_PROPOSE_SPLIT_TOOL} can propose candidate Work Items only; it must not claim capture or persistence.`,
        ...(names.has(WORK_ITEM_CAPTURE_TOOL)
          ? [
            `${WORK_ITEM_CAPTURE_TOOL} writes only draft/planned Work Items and must not create Tasks, Runs, or runtime sessions.`,
          ]
          : [
            `Do not request ${WORK_ITEM_CAPTURE_TOOL} until policy exposes a narrow-write intake tool surface.`,
          ]),
      ];
    case 'triage':
      return [
        'Triage tools may organize existing Work Items and Projects only.',
        'Triage tools must not claim completion or start Task, Run, or runtime execution.',
      ];
    case 'execution_preparation':
      return [
        `${WORK_ITEM_PREPARE_EXECUTION_TOOL} is read-only and returns proposals only.`,
        ...(names.has(WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL)
          ? [
            `${WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL} may create pending-approval Tasks but must not create Runs or start runtime checkout.`,
          ]
          : [
            `Do not request ${WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL} until policy exposes a narrow-write execution-preparation tool surface.`,
          ]),
        'Capture and execution must remain separated by an owner-visible acknowledgement boundary.',
      ];
    case 'external_tracker_binding':
      return [
        `${WORK_EXTERNAL_LINK_ISSUE_TOOL} and ${WORK_EXTERNAL_UNLINK_ISSUE_TOOL} write local binding metadata only.`,
        'Do not call external tracker APIs or imply bidirectional sync from this tool surface.',
      ];
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}
