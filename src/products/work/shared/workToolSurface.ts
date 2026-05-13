import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SupervisedToolManifest,
  type SupervisedToolSideEffect,
  type SupervisedToolApproval,
  type SupervisedToolPreflight,
} from '../../../platform/supervision/contracts.js';
import type { SupervisionRejectionCode } from '../../../platform/supervision/errors.js';

export const WORK_TOOL_PHASE_VALUES = [
  'intake',
  'triage',
  'execution_preparation',
  'external_tracker_binding',
] as const;

export type WorkToolPhase = (typeof WORK_TOOL_PHASE_VALUES)[number];

export const WORK_TOOL_CAPABILITY_PROFILE_VALUES = [
  'boss_cat',
  'strong_agent',
  'weak_worker',
  'unknown',
] as const;

export type WorkToolCapabilityProfile = (typeof WORK_TOOL_CAPABILITY_PROFILE_VALUES)[number];

export const WORK_ITEM_PROPOSE_SPLIT_TOOL = 'work.item.propose_split' as const;
export const WORK_ITEM_CAPTURE_TOOL = 'work.item.capture' as const;
export const WORK_ITEM_UPDATE_TOOL = 'work.item.update' as const;
export const WORK_ITEM_ASSIGN_PROJECT_TOOL = 'work.item.assign_project' as const;
export const WORK_ITEM_PREPARE_EXECUTION_TOOL = 'work.item.prepare_execution' as const;
export const WORK_PROJECT_LOOKUP_TOOL = 'work.project.lookup' as const;
export const WORK_PROJECT_CREATE_TOOL = 'work.project.create' as const;
export const WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL = 'work.task.create_from_work_item' as const;

export type PhaseScopedWorkToolName =
  | typeof WORK_ITEM_PROPOSE_SPLIT_TOOL
  | typeof WORK_ITEM_CAPTURE_TOOL
  | typeof WORK_ITEM_UPDATE_TOOL
  | typeof WORK_ITEM_ASSIGN_PROJECT_TOOL
  | typeof WORK_ITEM_PREPARE_EXECUTION_TOOL
  | typeof WORK_PROJECT_LOOKUP_TOOL
  | typeof WORK_PROJECT_CREATE_TOOL
  | typeof WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL;

export const WORK_TOOL_PHASE_BY_NAME: Readonly<Record<PhaseScopedWorkToolName, WorkToolPhase>> = {
  [WORK_ITEM_PROPOSE_SPLIT_TOOL]: 'intake',
  [WORK_ITEM_CAPTURE_TOOL]: 'intake',
  [WORK_ITEM_UPDATE_TOOL]: 'triage',
  [WORK_ITEM_ASSIGN_PROJECT_TOOL]: 'triage',
  [WORK_ITEM_PREPARE_EXECUTION_TOOL]: 'execution_preparation',
  [WORK_PROJECT_LOOKUP_TOOL]: 'triage',
  [WORK_PROJECT_CREATE_TOOL]: 'triage',
  [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL]: 'execution_preparation',
};

export const WORK_TOOL_ALLOWED_CAPABILITY_PROFILES_BY_NAME: Readonly<
  Record<PhaseScopedWorkToolName, readonly WorkToolCapabilityProfile[]>
> = {
  [WORK_ITEM_PROPOSE_SPLIT_TOOL]: ['boss_cat', 'strong_agent'],
  [WORK_ITEM_CAPTURE_TOOL]: ['boss_cat', 'strong_agent'],
  [WORK_ITEM_UPDATE_TOOL]: ['boss_cat', 'strong_agent'],
  [WORK_ITEM_ASSIGN_PROJECT_TOOL]: ['boss_cat', 'strong_agent'],
  [WORK_ITEM_PREPARE_EXECUTION_TOOL]: ['boss_cat'],
  [WORK_PROJECT_LOOKUP_TOOL]: ['boss_cat', 'strong_agent'],
  [WORK_PROJECT_CREATE_TOOL]: ['boss_cat', 'strong_agent'],
  [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL]: ['boss_cat'],
};

export const WORK_TOOL_SERVER_RESOLVED_FIELDS = [
  'workItemId',
  'projectId',
  'taskId',
  'missionId',
  'runId',
  'createdAt',
  'updatedAt',
  'createdByActorId',
  'ownerActorId',
  'assignedActorIds',
  'producerActorId',
] as const;

export const WORK_TOOL_ERROR_CODES = {
  schemaInvalid: 'E_SCHEMA_INVALID',
  precheckFailed: 'E_PRECHECK_FAILED',
  toolScopeDenied: 'E_TOOL_SCOPE_DENIED',
} as const satisfies Record<string, SupervisionRejectionCode>;

export const WORK_TOOL_VALIDATION_ERROR_CODES = [
  'required',
  'type',
  'blank',
  'too_long',
  'unsupported_value',
  'server_resolved_field',
  'bounds',
] as const;

export type WorkToolValidationErrorCode = (typeof WORK_TOOL_VALIDATION_ERROR_CODES)[number];

export interface WorkToolValidationError {
  code: WorkToolValidationErrorCode;
  field: string;
  message: string;
}

export const WORK_ITEM_KIND_VALUES = [
  'todo',
  'bug',
  'issue',
  'story',
  'requirement',
  'epic',
  'defect',
  'note',
] as const;

export type WorkItemKind = (typeof WORK_ITEM_KIND_VALUES)[number];

export const WORK_ITEM_PRIORITY_HINT_VALUES = [
  'urgent',
  'high',
  'medium',
  'low',
] as const;

export type WorkItemPriorityHint = (typeof WORK_ITEM_PRIORITY_HINT_VALUES)[number];

export const WORK_ITEM_CAPTURE_STATUS_VALUES = [
  'draft',
  'planned',
] as const;

export type WorkItemCaptureStatus = (typeof WORK_ITEM_CAPTURE_STATUS_VALUES)[number];

export const WORK_ITEM_TRIAGE_STATUS_VALUES = [
  'draft',
  'planned',
  'ready',
  'blocked',
] as const;

export type WorkItemTriageStatus = (typeof WORK_ITEM_TRIAGE_STATUS_VALUES)[number];

export const WORK_TOOL_SOURCE_SURFACE_VALUES = [
  'chat',
  'telegram',
] as const;

export type WorkToolSourceSurface = (typeof WORK_TOOL_SOURCE_SURFACE_VALUES)[number];

export interface WorkItemSourceRef {
  surface: WorkToolSourceSurface;
  conversationId?: string;
  channelId?: string;
  transportBindingId?: string;
  sourceMessageId?: string;
  sourceText?: string;
}

export interface WorkItemCaptureInput {
  title: string;
  source: WorkItemSourceRef;
  summary?: string;
  kind?: WorkItemKind;
  priority?: WorkItemPriorityHint;
  status?: WorkItemCaptureStatus;
  suggestedProjectTitle?: string;
  openQuestions?: string[];
}

export interface WorkItemCaptureResult {
  workItemId: string;
  status: WorkItemCaptureStatus;
  created: boolean;
  sourceRef: WorkItemSourceRef;
}

export interface WorkItemProposeSplitInput {
  source: WorkItemSourceRef;
  maxItems?: number;
  defaultKind?: WorkItemKind;
  defaultPriority?: WorkItemPriorityHint;
}

export interface WorkItemSplitCandidate {
  tempId: string;
  title: string;
  summary?: string;
  kind?: WorkItemKind;
  priority?: WorkItemPriorityHint;
  confidence: number;
  sourceExcerpt?: string;
  suggestedProjectTitle?: string;
  openQuestions?: string[];
}

export interface WorkItemProposeSplitResult {
  candidates: WorkItemSplitCandidate[];
  sourceRef: WorkItemSourceRef;
}

export interface WorkItemUpdateInput {
  workItemId: string;
  title?: string;
  summary?: string;
  status?: WorkItemTriageStatus;
  kind?: WorkItemKind;
  priority?: WorkItemPriorityHint;
  assignmentHint?: string;
  openQuestions?: string[];
}

export interface WorkItemUpdateResult {
  workItemId: string;
  status: WorkItemTriageStatus;
  updated: boolean;
}

export interface WorkItemAssignProjectInput {
  workItemId: string;
  projectId: string;
  note?: string;
}

export interface WorkItemAssignProjectResult {
  workItemId: string;
  projectId: string;
  assigned: boolean;
}

export interface WorkItemPrepareExecutionInput {
  workItemIds: string[];
  executionGoal?: string;
  maxItems?: number;
}

export type WorkItemExecutionReadiness = 'ready' | 'needs_triage' | 'blocked';

export interface WorkItemExecutionPreparationProposal {
  workItemId: string;
  title: string;
  status: WorkItemTriageStatus;
  projectId?: string;
  readiness: WorkItemExecutionReadiness;
  proposedTaskTitle: string;
  proposedTaskSummary: string;
  openQuestions: string[];
  blockers: string[];
}

export interface WorkItemPrepareExecutionResult {
  proposals: WorkItemExecutionPreparationProposal[];
}

export interface WorkTaskCreateFromWorkItemInput {
  workItemId: string;
  title?: string;
  summary?: string;
  approvalNote?: string;
}

export interface WorkTaskCreateFromWorkItemResult {
  workItemId: string;
  taskId: string;
  created: boolean;
  linked: boolean;
  taskStatus: 'pending_approval';
  approvalStatus: 'pending';
}

export interface WorkProjectLookupInput {
  query?: string;
  limit?: number;
  includeArchived?: boolean;
}

export interface WorkProjectLookupProject {
  projectId: string;
  title: string;
  status: 'planned' | 'active' | 'paused' | 'archived';
  summary?: string;
  repoPath?: string;
  primaryConversationId?: string;
  workItemCount: number;
}

export interface WorkProjectLookupResult {
  projects: WorkProjectLookupProject[];
}

export const WORK_PROJECT_CREATE_STATUS_VALUES = [
  'planned',
  'active',
  'paused',
] as const;

export type WorkProjectCreateStatus = (typeof WORK_PROJECT_CREATE_STATUS_VALUES)[number];

export interface WorkProjectCreateInput {
  title: string;
  summary?: string;
  status?: WorkProjectCreateStatus;
  repoPath?: string;
  primaryConversationId?: string;
}

export interface WorkProjectCreateResult {
  projectId: string;
  status: WorkProjectCreateStatus;
  created: boolean;
}

export interface PhaseScopedWorkToolFilterInput {
  phase: WorkToolPhase;
  capabilityProfile?: WorkToolCapabilityProfile;
}

export function createPhaseScopedWorkToolManifests(): SupervisedToolManifest[] {
  return [
    createManifest({
      name: WORK_ITEM_PROPOSE_SPLIT_TOOL,
      description: 'Propose candidate Work Items from one owner Chat or Telegram source.',
      sideEffect: 'none',
      preflight: 'available',
      approval: 'never',
      failureCodes: [WORK_TOOL_ERROR_CODES.schemaInvalid],
    }),
    createManifest({
      name: WORK_ITEM_CAPTURE_TOOL,
      description: 'Capture one draft or planned Work Item from owner-provided source text.',
      sideEffect: 'local_state',
      preflight: 'required',
      approval: 'policy',
      failureCodes: [
        WORK_TOOL_ERROR_CODES.schemaInvalid,
        WORK_TOOL_ERROR_CODES.precheckFailed,
      ],
    }),
    createManifest({
      name: WORK_ITEM_UPDATE_TOOL,
      description: 'Apply bounded triage updates to one existing Cats Work Item.',
      sideEffect: 'local_state',
      preflight: 'required',
      approval: 'policy',
      failureCodes: [
        WORK_TOOL_ERROR_CODES.schemaInvalid,
        WORK_TOOL_ERROR_CODES.precheckFailed,
      ],
    }),
    createManifest({
      name: WORK_ITEM_ASSIGN_PROJECT_TOOL,
      description: 'Attach one existing Cats Work Item to one existing Cats Work Project.',
      sideEffect: 'local_state',
      preflight: 'required',
      approval: 'policy',
      failureCodes: [
        WORK_TOOL_ERROR_CODES.schemaInvalid,
        WORK_TOOL_ERROR_CODES.precheckFailed,
      ],
    }),
    createManifest({
      name: WORK_ITEM_PREPARE_EXECUTION_TOOL,
      description: 'Propose execution preparation for selected Cats Work Items without writing Core.',
      sideEffect: 'none',
      preflight: 'available',
      approval: 'never',
      failureCodes: [
        WORK_TOOL_ERROR_CODES.schemaInvalid,
        WORK_TOOL_ERROR_CODES.precheckFailed,
      ],
    }),
    createManifest({
      name: WORK_PROJECT_LOOKUP_TOOL,
      description: 'Look up bounded Cats Work Projects for Work Item triage.',
      sideEffect: 'none',
      preflight: 'available',
      approval: 'never',
      failureCodes: [WORK_TOOL_ERROR_CODES.schemaInvalid],
    }),
    createManifest({
      name: WORK_PROJECT_CREATE_TOOL,
      description: 'Create one Cats Work Project during triage.',
      sideEffect: 'local_state',
      preflight: 'required',
      approval: 'policy',
      failureCodes: [
        WORK_TOOL_ERROR_CODES.schemaInvalid,
        WORK_TOOL_ERROR_CODES.precheckFailed,
      ],
    }),
    createManifest({
      name: WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
      description: 'Create a pending-approval Task from one Cats Work Item.',
      sideEffect: 'local_state',
      preflight: 'required',
      approval: 'policy',
      failureCodes: [
        WORK_TOOL_ERROR_CODES.schemaInvalid,
        WORK_TOOL_ERROR_CODES.precheckFailed,
      ],
    }),
  ];
}

export function resolveWorkToolPhase(toolName: string): WorkToolPhase | undefined {
  if (
    toolName === WORK_ITEM_PROPOSE_SPLIT_TOOL
    || toolName === WORK_ITEM_CAPTURE_TOOL
    || toolName === WORK_ITEM_UPDATE_TOOL
    || toolName === WORK_ITEM_ASSIGN_PROJECT_TOOL
    || toolName === WORK_ITEM_PREPARE_EXECUTION_TOOL
    || toolName === WORK_PROJECT_LOOKUP_TOOL
    || toolName === WORK_PROJECT_CREATE_TOOL
    || toolName === WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL
  ) {
    return WORK_TOOL_PHASE_BY_NAME[toolName];
  }

  return undefined;
}

export function isWorkToolAllowedForCapabilityProfile(
  toolName: string,
  capabilityProfile: WorkToolCapabilityProfile,
): boolean {
  if (
    toolName !== WORK_ITEM_PROPOSE_SPLIT_TOOL
    && toolName !== WORK_ITEM_CAPTURE_TOOL
    && toolName !== WORK_ITEM_UPDATE_TOOL
    && toolName !== WORK_ITEM_ASSIGN_PROJECT_TOOL
    && toolName !== WORK_ITEM_PREPARE_EXECUTION_TOOL
    && toolName !== WORK_PROJECT_LOOKUP_TOOL
    && toolName !== WORK_PROJECT_CREATE_TOOL
    && toolName !== WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL
  ) {
    return false;
  }

  return WORK_TOOL_ALLOWED_CAPABILITY_PROFILES_BY_NAME[toolName].includes(capabilityProfile);
}

export function filterPhaseScopedWorkToolManifests(
  manifests: SupervisedToolManifest[],
  input: PhaseScopedWorkToolFilterInput,
): SupervisedToolManifest[] {
  return manifests
    .filter((manifest) => {
      if (resolveWorkToolPhase(manifest.name) !== input.phase) {
        return false;
      }
      if (input.capabilityProfile === undefined) {
        return true;
      }

      return isWorkToolAllowedForCapabilityProfile(manifest.name, input.capabilityProfile);
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function validateWorkItemCaptureInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work item capture input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input),
    ...validateRequiredString(input, 'title', 180),
    ...validateOptionalString(input, 'summary', 4000),
    ...validateOptionalString(input, 'suggestedProjectTitle', 160),
    ...validateOptionalEnum(input, 'kind', WORK_ITEM_KIND_VALUES),
    ...validateOptionalEnum(input, 'priority', WORK_ITEM_PRIORITY_HINT_VALUES),
    ...validateOptionalEnum(input, 'status', WORK_ITEM_CAPTURE_STATUS_VALUES),
    ...validateOpenQuestions(input),
    ...validateSourceRef(input.source, 'source'),
  ];
}

export function validateWorkItemProposeSplitInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work item split proposal input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input),
    ...validateSourceRef(input.source, 'source'),
    ...validateOptionalIntegerRange(input, 'maxItems', 1, 20),
    ...validateOptionalEnum(input, 'defaultKind', WORK_ITEM_KIND_VALUES),
    ...validateOptionalEnum(input, 'defaultPriority', WORK_ITEM_PRIORITY_HINT_VALUES),
  ];
}

export function validateWorkItemUpdateInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work item update input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input, '', new Set(['workItemId'])),
    ...validateRequiredString(input, 'workItemId', 160),
    ...validateOptionalString(input, 'title', 180),
    ...validateOptionalString(input, 'summary', 4000),
    ...validateOptionalEnum(input, 'status', WORK_ITEM_TRIAGE_STATUS_VALUES),
    ...validateOptionalEnum(input, 'kind', WORK_ITEM_KIND_VALUES),
    ...validateOptionalEnum(input, 'priority', WORK_ITEM_PRIORITY_HINT_VALUES),
    ...validateOptionalString(input, 'assignmentHint', 500),
    ...validateOpenQuestions(input),
    ...validateAtLeastOneWorkItemUpdateField(input),
  ];
}

export function validateWorkItemAssignProjectInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work item project assignment input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input, '', new Set(['workItemId', 'projectId'])),
    ...validateRequiredString(input, 'workItemId', 160),
    ...validateRequiredString(input, 'projectId', 160),
    ...validateOptionalString(input, 'note', 500),
  ];
}

export function validateWorkItemPrepareExecutionInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work item execution preparation input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input),
    ...validateRequiredStringArray(input, 'workItemIds', 1, 20, 160),
    ...validateOptionalString(input, 'executionGoal', 1000),
    ...validateOptionalIntegerRange(input, 'maxItems', 1, 20),
  ];
}

export function validateWorkTaskCreateFromWorkItemInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work task creation input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input, '', new Set(['workItemId'])),
    ...validateRequiredString(input, 'workItemId', 160),
    ...validateOptionalString(input, 'title', 180),
    ...validateOptionalString(input, 'summary', 4000),
    ...validateOptionalString(input, 'approvalNote', 500),
  ];
}

export function validateWorkProjectLookupInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work project lookup input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input),
    ...validateOptionalString(input, 'query', 160),
    ...validateOptionalIntegerRange(input, 'limit', 1, 20),
    ...validateOptionalBoolean(input, 'includeArchived'),
  ];
}

export function validateWorkProjectCreateInput(input: unknown): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'Work project create input must be an object.')];
  }

  return [
    ...validateServerResolvedFields(input),
    ...validateRequiredString(input, 'title', 160),
    ...validateOptionalString(input, 'summary', 4000),
    ...validateOptionalEnum(input, 'status', WORK_PROJECT_CREATE_STATUS_VALUES),
    ...validateOptionalString(input, 'repoPath', 500),
    ...validateOptionalString(input, 'primaryConversationId', 160),
  ];
}

function createManifest(input: {
  name: PhaseScopedWorkToolName;
  description: string;
  sideEffect: SupervisedToolSideEffect;
  preflight: SupervisedToolPreflight;
  approval: SupervisedToolApproval;
  failureCodes: SupervisionRejectionCode[];
}): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: input.name,
    manifestVersion: '1.0',
    description: input.description,
    sideEffect: input.sideEffect,
    preflight: input.preflight,
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: input.approval,
    evidence: 'summary',
    failureCodes: input.failureCodes,
    inputSchema: {
      id: `${input.name}.input`,
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: `${input.name}.output`,
      version: '1.0',
      format: 'json_schema',
    },
  };
}

function validateSourceRef(input: unknown, field: string): WorkToolValidationError[] {
  if (!isRecord(input)) {
    return [error('required', field, 'Source reference is required.')];
  }

  return [
    ...validateRequiredEnum(input, `${field}.surface`, 'surface', WORK_TOOL_SOURCE_SURFACE_VALUES),
    ...validateOptionalString(input, 'conversationId', 160, field),
    ...validateOptionalString(input, 'channelId', 160, field),
    ...validateOptionalString(input, 'transportBindingId', 160, field),
    ...validateOptionalString(input, 'sourceMessageId', 160, field),
    ...validateOptionalString(input, 'sourceText', 4000, field),
  ];
}

function validateServerResolvedFields(
  input: Record<string, unknown>,
  prefix = '',
  allowedFields: ReadonlySet<string> = new Set(),
): WorkToolValidationError[] {
  const errors: WorkToolValidationError[] = [];

  for (const [key, value] of Object.entries(input)) {
    const field = prefix === '' ? key : `${prefix}.${key}`;
    if (
      value !== undefined
      && value !== null
      && isServerResolvedField(key)
      && !allowedFields.has(key)
    ) {
      errors.push(error(
        'server_resolved_field',
        field,
        `${field} is server-resolved and must not be supplied by the caller.`,
      ));
      continue;
    }
    if (isRecord(value)) {
      errors.push(...validateServerResolvedFields(value, field, allowedFields));
      continue;
    }
    if (Array.isArray(value)) {
      errors.push(...validateServerResolvedArray(value, field, allowedFields));
    }
  }

  return errors;
}

function validateServerResolvedArray(
  input: unknown[],
  prefix: string,
  allowedFields: ReadonlySet<string>,
): WorkToolValidationError[] {
  const errors: WorkToolValidationError[] = [];

  input.forEach((item, index) => {
    if (isRecord(item)) {
      errors.push(...validateServerResolvedFields(item, `${prefix}[${index}]`, allowedFields));
    }
  });

  return errors;
}

function isServerResolvedField(field: string): boolean {
  return (WORK_TOOL_SERVER_RESOLVED_FIELDS as readonly string[]).includes(field);
}

function validateRequiredString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
  prefix = '',
): WorkToolValidationError[] {
  const value = input[key];
  const field = prefix === '' ? key : `${prefix}.${key}`;

  if (value === undefined || value === null) {
    return [error('required', field, `${field} is required.`)];
  }

  return validateStringValue(value, field, maxLength, true);
}

function validateOptionalString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
  prefix = '',
): WorkToolValidationError[] {
  const value = input[key];
  const field = prefix === '' ? key : `${prefix}.${key}`;

  if (value === undefined || value === null) {
    return [];
  }

  return validateStringValue(value, field, maxLength, false);
}

function validateStringValue(
  value: unknown,
  field: string,
  maxLength: number,
  rejectBlank: boolean,
): WorkToolValidationError[] {
  if (typeof value !== 'string') {
    return [error('type', field, `${field} must be a string.`)];
  }
  if (rejectBlank && value.trim() === '') {
    return [error('blank', field, `${field} must not be blank.`)];
  }
  if (value.length > maxLength) {
    return [error('too_long', field, `${field} must be ${maxLength} characters or fewer.`)];
  }

  return [];
}

function validateRequiredEnum<T extends readonly string[]>(
  input: Record<string, unknown>,
  field: string,
  key: string,
  values: T,
): WorkToolValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [error('required', field, `${field} is required.`)];
  }
  if (typeof value !== 'string' || !values.includes(value)) {
    return [error(
      'unsupported_value',
      field,
      `${field} must be one of: ${values.join(', ')}.`,
    )];
  }

  return [];
}

function validateOptionalEnum<T extends readonly string[]>(
  input: Record<string, unknown>,
  key: string,
  values: T,
): WorkToolValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== 'string' || !values.includes(value)) {
    return [error(
      'unsupported_value',
      key,
      `${key} must be one of: ${values.join(', ')}.`,
    )];
  }

  return [];
}

function validateOptionalIntegerRange(
  input: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): WorkToolValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return [error('type', key, `${key} must be an integer.`)];
  }
  if (value < min || value > max) {
    return [error('bounds', key, `${key} must be between ${min} and ${max}.`)];
  }

  return [];
}

function validateOptionalBoolean(
  input: Record<string, unknown>,
  key: string,
): WorkToolValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== 'boolean') {
    return [error('type', key, `${key} must be a boolean.`)];
  }

  return [];
}

function validateRequiredStringArray(
  input: Record<string, unknown>,
  key: string,
  minItems: number,
  maxItems: number,
  maxStringLength: number,
): WorkToolValidationError[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    return [error('required', key, `${key} must be an array of strings.`)];
  }
  if (value.length < minItems || value.length > maxItems) {
    return [error(
      'bounds',
      key,
      `${key} must contain between ${minItems} and ${maxItems} items.`,
    )];
  }

  return value.flatMap((item, index) =>
    validateStringValue(item, `${key}[${index}]`, maxStringLength, true),
  );
}

function validateAtLeastOneWorkItemUpdateField(
  input: Record<string, unknown>,
): WorkToolValidationError[] {
  const mutableFields = [
    'title',
    'summary',
    'status',
    'kind',
    'priority',
    'assignmentHint',
    'openQuestions',
  ];

  if (mutableFields.some((field) => input[field] !== undefined && input[field] !== null)) {
    return [];
  }

  return [error('required', '$', 'At least one Work Item update field is required.')];
}

function validateOpenQuestions(input: Record<string, unknown>): WorkToolValidationError[] {
  const value = input.openQuestions;
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [error('type', 'openQuestions', 'openQuestions must be an array of strings.')];
  }
  if (value.length > 10) {
    return [error('bounds', 'openQuestions', 'openQuestions must contain 10 items or fewer.')];
  }

  return value.flatMap((item, index) =>
    validateStringValue(item, `openQuestions[${index}]`, 300, true),
  );
}

function error(
  code: WorkToolValidationErrorCode,
  field: string,
  message: string,
): WorkToolValidationError {
  return {
    code,
    field,
    message,
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
