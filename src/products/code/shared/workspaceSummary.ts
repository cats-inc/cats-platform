import type {
  CoreRecordMetadata,
  CoreTaskRecord,
} from '../../../core/types.js';

export const CODE_WORKSPACE_METADATA_KEY = 'codeWorkspace';

export type CodeWorkspaceKind = 'user_selected' | 'managed_room' | 'conversation_repo';
export type CodeWorkspaceOwnershipState = 'owner_selected' | 'room_owned' | 'conversation_bound';

export interface CodeWorkspaceSummary {
  workspacePath: string;
  workspaceKind: CodeWorkspaceKind;
  ownershipState: CodeWorkspaceOwnershipState;
}

function asRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWorkspaceKind(value: unknown): CodeWorkspaceKind | null {
  return value === 'user_selected'
    || value === 'managed_room'
    || value === 'conversation_repo'
    ? value
    : null;
}

export function resolveCodeWorkspaceOwnershipState(
  workspaceKind: CodeWorkspaceKind,
): CodeWorkspaceOwnershipState {
  switch (workspaceKind) {
    case 'conversation_repo':
      return 'conversation_bound';
    case 'managed_room':
      return 'room_owned';
    default:
      return 'owner_selected';
  }
}

export function createCodeWorkspaceSummary(input: {
  workspacePath: string;
  workspaceKind: CodeWorkspaceKind;
}): CodeWorkspaceSummary {
  return {
    workspacePath: input.workspacePath,
    workspaceKind: input.workspaceKind,
    ownershipState: resolveCodeWorkspaceOwnershipState(input.workspaceKind),
  };
}

export function readCodeWorkspaceSummary(
  metadata: CoreRecordMetadata | null | undefined,
): CodeWorkspaceSummary | null {
  const workspace = asRecord(metadata?.[CODE_WORKSPACE_METADATA_KEY]);
  if (!workspace) {
    return null;
  }

  const workspacePath = readNonEmptyString(workspace.workspacePath);
  const workspaceKind = normalizeWorkspaceKind(workspace.workspaceKind);
  if (!workspacePath || !workspaceKind) {
    return null;
  }

  return createCodeWorkspaceSummary({ workspacePath, workspaceKind });
}

export function readCodeWorkspaceSummaryFromTask(
  task: Pick<CoreTaskRecord, 'metadata'>,
): CodeWorkspaceSummary | null {
  return readCodeWorkspaceSummary(task.metadata);
}

export function writeCodeWorkspaceSummary(
  metadata: CoreRecordMetadata | null | undefined,
  workspace: {
    workspacePath: string;
    workspaceKind: CodeWorkspaceKind;
  } | null | undefined,
): CoreRecordMetadata {
  const next = metadata ? structuredClone(metadata) : {};
  if (!workspace?.workspacePath) {
    delete next[CODE_WORKSPACE_METADATA_KEY];
    return next;
  }

  next[CODE_WORKSPACE_METADATA_KEY] = createCodeWorkspaceSummary({
    workspacePath: workspace.workspacePath,
    workspaceKind: workspace.workspaceKind,
  });
  return next;
}
