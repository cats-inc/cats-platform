/** SPEC-142 FR-22 to FR-24: a conversation's Project, read and changed on the owner-only route. */
export interface ConversationWorkProjectOption {
  id: string;
  title: string;
  status: string;
  folder: string | null;
  otherConversations: number;
  workItems: number;
}

export interface ConversationWorkProjectView {
  channelId: string;
  projectId: string | null;
  project: { id: string; title: string; status: string; folder: string | null } | null;
  revision: number;
  canChange: boolean;
  refusal: string | null;
  projects: ConversationWorkProjectOption[];
}

/** A refused or failed read or change, with the route's stable code when it sent one. */
export class ConversationWorkProjectError extends Error {
  constructor(readonly code: string | null, message: string) {
    super(message);
    this.name = 'ConversationWorkProjectError';
  }
}

function workProjectPath(channelId: string): string {
  return `/api/channels/${encodeURIComponent(channelId)}/work-project`;
}

async function readFailure(response: Response): Promise<ConversationWorkProjectError> {
  try {
    const payload = await response.json() as { error?: { code?: unknown; message?: unknown } | string };
    if (payload.error && typeof payload.error === 'object') {
      return new ConversationWorkProjectError(
        typeof payload.error.code === 'string' ? payload.error.code : null,
        typeof payload.error.message === 'string' ? payload.error.message : `HTTP ${response.status}`,
      );
    }
  } catch {
    // The body was not JSON; the status is all there is.
  }
  return new ConversationWorkProjectError(null, `HTTP ${response.status}`);
}

export async function fetchConversationWorkProject(channelId: string, signal?: AbortSignal): Promise<ConversationWorkProjectView> {
  const response = await fetch(workProjectPath(channelId), { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw await readFailure(response);
  return await response.json() as ConversationWorkProjectView;
}

/** FR-23: set, change or clear it, against the revision the owner saw. */
export async function setConversationWorkProject(
  channelId: string,
  projectId: string | null,
  revision: number,
): Promise<{ projectId: string | null; revision: number }> {
  const response = await fetch(workProjectPath(channelId), {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ projectId, revision }),
  });
  if (!response.ok) throw await readFailure(response);
  return await response.json() as { projectId: string | null; revision: number };
}
