import { stat } from 'node:fs/promises';

import {
  createCodeWorkspaceSummary,
  type CodeWorkspaceKind,
  type CodeWorkspaceSummary,
} from '../shared/workspaceSummary.js';

export interface ResolveCodeWorkspaceInput {
  explicitPath?: string | null;
  conversationRepoPath?: string | null;
  roomWorkspacePath?: string | null;
}

export interface CodeWorkspaceResolutionResult {
  resolved: boolean;
  workspace: CodeWorkspaceSummary | null;
  error: string | null;
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const info = await stat(dirPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function resolveCodeWorkspace(
  input: ResolveCodeWorkspaceInput,
): Promise<CodeWorkspaceResolutionResult> {
  const explicit = input.explicitPath?.trim() || null;
  if (explicit) {
    if (await isDirectory(explicit)) {
      return {
        resolved: true,
        workspace: createCodeWorkspaceSummary({
          workspacePath: explicit,
          workspaceKind: 'user_selected',
        }),
        error: null,
      };
    }
    return {
      resolved: false,
      workspace: null,
      error: `Selected path does not exist or is not a directory: ${explicit}`,
    };
  }

  const conversationRepo = input.conversationRepoPath?.trim() || null;
  if (conversationRepo) {
    if (await isDirectory(conversationRepo)) {
      return {
        resolved: true,
        workspace: createCodeWorkspaceSummary({
          workspacePath: conversationRepo,
          workspaceKind: 'conversation_repo',
        }),
        error: null,
      };
    }
  }

  const roomWorkspace = input.roomWorkspacePath?.trim() || null;
  if (roomWorkspace) {
    if (await isDirectory(roomWorkspace)) {
      return {
        resolved: true,
        workspace: createCodeWorkspaceSummary({
          workspacePath: roomWorkspace,
          workspaceKind: 'managed_room',
        }),
        error: null,
      };
    }
  }

  return {
    resolved: false,
    workspace: null,
    error: 'No valid workspace path found. Provide an explicit path or ensure the room workspace exists.',
  };
}
