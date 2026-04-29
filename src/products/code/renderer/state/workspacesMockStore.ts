import { useSyncExternalStore } from "react";

/**
 * Mock Workspaces store for Cats Code sidebar preview.
 *
 * Pinning model mirrors pinnedProjectPreferences in Work: every workspace
 * is pinned by default, the unpinned set is persisted in localStorage.
 * Replace with a real projection over Code workspaces (Conversation
 * `repoPath`, task `codeWorkspace`, runtime `cwd`) once SPEC-091 lands.
 */

export type CodeWorkspaceStatus =
  | "active"
  | "ready"
  | "draft"
  | "paused"
  | "archived";

export type CodeWorkspaceSource =
  | "managed_room"
  | "owner_folder"
  | "conversation_repo"
  | "runtime_cwd";

export interface CodeWorkspaceMock {
  id: string;
  title: string;
  summary: string | null;
  path: string;
  status: CodeWorkspaceStatus;
  source: CodeWorkspaceSource;
  conversationCount: number;
  taskCount: number;
  artifactCount: number;
  lastActiveAt: string;
}

const STORAGE_KEY_UNPINNED = "cats-code:unpinned-workspaces";
const STORAGE_KEY_LOCAL_DELETED = "cats-code:deleted-workspaces";
const STORAGE_KEY_LOCAL_ADDITIONS = "cats-code:added-workspaces";

const NOW = new Date("2026-04-28T18:00:00.000Z").getTime();
const RELATIVE_HOUR = 60 * 60 * 1000;

const SEED_WORKSPACES: readonly CodeWorkspaceMock[] = [
  {
    id: "ws-cats-platform",
    title: "cats-platform",
    summary: "Main monorepo for the Cats product family",
    path: "C:\\Users\\middl\\Source\\SK2\\one-man-digital-company\\cats-platform",
    status: "active",
    source: "owner_folder",
    conversationCount: 6,
    taskCount: 4,
    artifactCount: 9,
    lastActiveAt: new Date(NOW - 1.5 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "ws-paperclip",
    title: "paperclip",
    summary: "Competitor analysis sandbox",
    path: "C:\\Users\\middl\\Source\\SK2\\one-man-digital-company\\paperclip",
    status: "ready",
    source: "conversation_repo",
    conversationCount: 2,
    taskCount: 1,
    artifactCount: 3,
    lastActiveAt: new Date(NOW - 6 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "ws-pomodoro-app",
    title: "pomodoro-app",
    summary: "Throwaway preview built from the Pomodoro quick prompt",
    path: "C:\\Users\\middl\\.cats\\runtime\\sessions\\7cd429d0-pomodoro",
    status: "draft",
    source: "runtime_cwd",
    conversationCount: 1,
    taskCount: 1,
    artifactCount: 2,
    lastActiveAt: new Date(NOW - 22 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "ws-omdc-cli",
    title: "omdc-cli",
    summary: "Ecosystem management CLI tool",
    path: "C:\\Users\\middl\\Source\\SK2\\one-man-digital-company\\omdc-cli",
    status: "paused",
    source: "owner_folder",
    conversationCount: 0,
    taskCount: 0,
    artifactCount: 1,
    lastActiveAt: new Date(NOW - 5 * 24 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "ws-managed-room-q-launch",
    title: "QQ launch room",
    summary: "Managed-room execution context for QQ companion launch work",
    path: "[managed-room] qq-launch-room-001",
    status: "archived",
    source: "managed_room",
    conversationCount: 1,
    taskCount: 0,
    artifactCount: 0,
    lastActiveAt: new Date(NOW - 14 * 24 * RELATIVE_HOUR).toISOString(),
  },
];

function loadStringSet(key: string): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set<string>(parsed as string[]) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function saveStringSet(key: string, set: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function loadAdditions(): CodeWorkspaceMock[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY_LOCAL_ADDITIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CodeWorkspaceMock[]) : [];
  } catch {
    return [];
  }
}

function saveAdditions(items: readonly CodeWorkspaceMock[]): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY_LOCAL_ADDITIONS,
      JSON.stringify(items),
    );
  } catch {
    // ignore
  }
}

const unpinned = loadStringSet(STORAGE_KEY_UNPINNED);
const deleted = loadStringSet(STORAGE_KEY_LOCAL_DELETED);
const additions: CodeWorkspaceMock[] = loadAdditions();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export interface WorkspacesMockSnapshot {
  workspaces: readonly CodeWorkspaceMock[];
  pinnedIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
}

export function createEmptyWorkspacesMockSnapshot(): WorkspacesMockSnapshot {
  return {
    workspaces: [],
    pinnedIds: new Set<string>(),
    deletedIds: new Set<string>(),
  };
}

let cachedSnapshot: WorkspacesMockSnapshot | null = null;

function rebuildSnapshot(): WorkspacesMockSnapshot {
  const all = [...additions, ...SEED_WORKSPACES].sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );
  const visible = all.filter((ws) => !deleted.has(ws.id));
  const pinnedIds = new Set<string>();
  for (const ws of visible) {
    if (!unpinned.has(ws.id)) pinnedIds.add(ws.id);
  }
  return {
    workspaces: visible,
    pinnedIds,
    deletedIds: new Set(deleted),
  };
}

function getSnapshot(): WorkspacesMockSnapshot {
  if (!cachedSnapshot) cachedSnapshot = rebuildSnapshot();
  return cachedSnapshot;
}

function invalidate(): void {
  cachedSnapshot = null;
  notify();
}

export interface CreateWorkspaceInput {
  title: string;
  path: string;
  summary?: string | null;
  status?: CodeWorkspaceStatus;
  source?: CodeWorkspaceSource;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const workspacesMockStore = {
  isPinned(id: string): boolean {
    return !unpinned.has(id);
  },
  pin(id: string): void {
    if (!unpinned.has(id)) return;
    unpinned.delete(id);
    saveStringSet(STORAGE_KEY_UNPINNED, unpinned);
    invalidate();
  },
  unpin(id: string): void {
    if (unpinned.has(id)) return;
    unpinned.add(id);
    saveStringSet(STORAGE_KEY_UNPINNED, unpinned);
    invalidate();
  },
  remove(id: string): void {
    if (deleted.has(id)) return;
    deleted.add(id);
    saveStringSet(STORAGE_KEY_LOCAL_DELETED, deleted);
    invalidate();
  },
  restoreAll(): void {
    deleted.clear();
    unpinned.clear();
    additions.length = 0;
    saveStringSet(STORAGE_KEY_LOCAL_DELETED, deleted);
    saveStringSet(STORAGE_KEY_UNPINNED, unpinned);
    saveAdditions(additions);
    invalidate();
  },
  create(input: CreateWorkspaceInput): CodeWorkspaceMock {
    const slug = slugify(input.title) || "workspace";
    const id = `ws-mock-${slug}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const workspace: CodeWorkspaceMock = {
      id,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      path: input.path.trim(),
      status: input.status ?? "active",
      source: input.source ?? "owner_folder",
      conversationCount: 0,
      taskCount: 0,
      artifactCount: 0,
      lastActiveAt: now,
    };
    additions.unshift(workspace);
    saveAdditions(additions);
    invalidate();
    return workspace;
  },
  getById(id: string): CodeWorkspaceMock | null {
    return getSnapshot().workspaces.find((ws) => ws.id === id) ?? null;
  },
};

export function useWorkspacesMock(): WorkspacesMockSnapshot {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot,
    getSnapshot,
  );
}
