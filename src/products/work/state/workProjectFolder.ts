import { appendCoreActivity } from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { WorkTriageMutationContext } from './workTriageDelegate.js';

/**
 * SPEC-142 FR-19: a folder for an existing Project, a new Work write. A Project's folder is where
 * the supervised runs of its Work Items start without asking, so only a confirmed proposal, whose
 * card says so (FR-16), reaches this.
 */

const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** A folder as a path: absolute, one line, bounded. */
export function normalizeWorkProjectFolder(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const folder = value.trim();
  if (!folder || folder.length > 500 || UNSAFE.test(folder)) return null;
  const absolute = /^[A-Za-z]:[\\/]/u.test(folder) || folder.startsWith('/') || folder.startsWith('\\\\');
  return absolute ? folder : null;
}

export async function setWorkProjectFolder(
  coreStore: CoreStore,
  input: { projectId: string; folder: string },
  context: WorkTriageMutationContext,
  now: () => Date = () => new Date(),
): Promise<ToolResult<{ projectId: string; folder: string }>> {
  const folder = normalizeWorkProjectFolder(input.folder);
  if (!folder) {
    return { status: 'rejected', error: { code: 'E_SCHEMA_INVALID', message: 'The folder must be an absolute path.' } as never };
  }
  let found = false;
  let archived = false;
  const at = now();
  await coreStore.updateCore((core) => {
    const project = core.projects.find((entry) => entry.id === input.projectId);
    if (!project) return core;
    found = true;
    if (project.status === 'archived') { archived = true; return core; }
    const next = {
      ...core,
      projects: core.projects.map((entry) => entry.id === project.id
        ? { ...entry, repoPath: folder, updatedAt: at.toISOString() }
        : entry),
    };
    return appendCoreActivity(next, {
      kind: 'note',
      actorId: context.actorRef,
      projectId: project.id,
      conversationId: project.primaryConversationId,
      message: `Set the folder of Project: ${project.title}`,
      metadata: {
        ...(context.confirmedByActorId ? { confirmedByActorId: context.confirmedByActorId } : {}),
        workProjectFolder: { previous: project.repoPath, folder },
      },
    }, at).core;
  });
  if (!found) return { status: 'rejected', error: { code: 'E_NOT_FOUND', message: 'Project not found.' } as never };
  if (archived) return { status: 'rejected', error: { code: 'E_PRECHECK_FAILED', message: 'That Project is archived.' } as never };
  return { status: 'applied', result: { projectId: input.projectId, folder } };
}
