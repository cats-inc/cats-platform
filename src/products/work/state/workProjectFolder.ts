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
const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * A folder as a path on this computer: absolute for this OS, one line, bounded, with no `..`
 * segment. Network shares (`\\host\share`, `//host`) and device paths (`\\?\`, `\\.\`) are
 * refused, since a supervised run that opens one could reach another machine.
 */
export function normalizeWorkProjectFolder(value: unknown, platform: NodeJS.Platform = process.platform): string | null {
  if (typeof value !== 'string') return null;
  const folder = value.trim();
  if (!folder || folder.length > 500 || UNSAFE.test(folder)) return null;
  if (/^[\\/]{2}/u.test(folder)) return null;
  if (folder.split(/[\\/]/u).some((segment) => segment === '..')) return null;
  const absolute = platform === 'win32' ? /^[A-Za-z]:[\\/]/u.test(folder) : folder.startsWith('/');
  return absolute ? folder : null;
}

/**
 * A folder as a card or a dialog shows it: whole, with any hidden character written out as
 * `\u{…}`, so a folder stored before these checks cannot look like another one.
 */
export function visibleWorkProjectFolder(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.replace(HIDDEN, (char) => `\\u{${char.codePointAt(0)!.toString(16).toUpperCase()}}`);
}

export async function setWorkProjectFolder(
  coreStore: CoreStore,
  input: { projectId: string; folder: string },
  context: WorkTriageMutationContext,
  options: { now?: () => Date; platform?: NodeJS.Platform } = {},
): Promise<ToolResult<{ projectId: string; folder: string }>> {
  const now = options.now ?? (() => new Date());
  const folder = normalizeWorkProjectFolder(input.folder, options.platform);
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
