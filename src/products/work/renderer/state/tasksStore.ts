import { useSyncExternalStore } from "react";

import { MOCK_WORK_GRAPH } from "../components/topdown/mock";
import type { WorkGraphObjectSummary } from "../components/topdown/types";

const STORAGE_KEY_DELETED = "cats-work:deleted-tasks";
const STORAGE_KEY_CREATED = "cats-work:created-tasks";

export type TaskPriority = "urgent" | "high" | "medium" | "low";

/**
 * Renderer-side Task display shape. Extends WorkGraphObjectSummary so
 * the SPEC-090 LinkageSection / Phase 5 producer pipeline can resolve
 * a task as a link endpoint without a separate adapter. Adds
 * Paperclip-inspired display fields (priority / assignee / parent /
 * acceptance criteria) that don't exist in the canonical Core
 * WorkGraphObjectSummary today — those will move to Core record
 * metadata when the renderer migrates off MOCK_WORK_GRAPH.
 */
export interface TaskItem extends WorkGraphObjectSummary {
  kind: "task";
  priority: TaskPriority | null;
  assigneeName: string | null;
  parentTaskId: string | null;
  acceptanceCriteria: string | null;
}

const MOCK_TASK_EXTRAS: Record<
  string,
  {
    priority: TaskPriority;
    assigneeName: string;
    parentTaskId: string | null;
    acceptanceCriteria: string;
  }
> = {
  "task-hero-copy": {
    priority: "high",
    assigneeName: "Marketing Cat",
    parentTaskId: null,
    acceptanceCriteria: "Final hero copy approved by owner.",
  },
  "task-deploy": {
    priority: "urgent",
    assigneeName: "RD Cat",
    parentTaskId: null,
    acceptanceCriteria: "Landing page reachable at staging URL.",
  },
  "task-read-transcripts": {
    priority: "medium",
    assigneeName: "CS Cat",
    parentTaskId: null,
    acceptanceCriteria: "Bottleneck root cause documented.",
  },
  "task-write-spec": {
    priority: "low",
    assigneeName: "RD Cat",
    parentTaskId: null,
    acceptanceCriteria: "Role spec approved by owner.",
  },
};

const deleted = new Set<string>(loadStringSet(STORAGE_KEY_DELETED));
const createdTasks: TaskItem[] = loadCreatedTasks();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
let cachedSnapshot: TasksSnapshot | null = null;

function loadStringSet(key: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveStringSet(key: string, set: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function loadCreatedTasks(): TaskItem[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY_CREATED);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as TaskItem[];
  } catch {
    return [];
  }
}

function saveCreatedTasks(): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY_CREATED,
      JSON.stringify(createdTasks),
    );
  } catch {
    // ignore
  }
}

function notify(): void {
  snapshotVersion += 1;
  cachedSnapshot = null;
  for (const l of listeners) l();
}

export interface TasksSnapshot {
  version: number;
  allTasks: readonly TaskItem[];
  deletedIds: ReadonlySet<string>;
}

function decorateMockTask(o: WorkGraphObjectSummary): TaskItem {
  const extras = MOCK_TASK_EXTRAS[o.id] ?? null;
  return {
    ...o,
    kind: "task",
    priority: extras?.priority ?? null,
    assigneeName: extras?.assigneeName ?? null,
    parentTaskId: extras?.parentTaskId ?? null,
    acceptanceCriteria: extras?.acceptanceCriteria ?? null,
  };
}

function buildSnapshot(): TasksSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const mockTasks = MOCK_WORK_GRAPH.objects
    .filter((obj): obj is WorkGraphObjectSummary => obj.kind === "task")
    .map(decorateMockTask);
  cachedSnapshot = {
    version: snapshotVersion,
    allTasks: [...mockTasks, ...createdTasks],
    deletedIds: new Set(deleted),
  };
  return cachedSnapshot;
}

export interface CreateTaskInput {
  title: string;
  summary?: string | null;
  status?: string;
  priority?: TaskPriority | null;
  ownerRole?: string | null;
  assigneeName?: string | null;
  nextAction?: string | null;
  acceptanceCriteria?: string | null;
  linkedProjectId?: string | null;
  linkedWorkItemId?: string | null;
  parentTaskId?: string | null;
}

function generateTaskId(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `task-${stamp}-${random}`;
}

export const tasksStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): TasksSnapshot {
    return buildSnapshot();
  },
  isDeleted(id: string): boolean {
    return deleted.has(id);
  },
  remove(id: string): void {
    if (deleted.has(id)) return;
    deleted.add(id);
    saveStringSet(STORAGE_KEY_DELETED, deleted);
    notify();
  },
  createTask(input: CreateTaskInput): TaskItem {
    const now = new Date().toISOString();
    const id = generateTaskId();
    const task: TaskItem = {
      id,
      kind: "task",
      structuralLayer: "execution",
      sourceRecordFamily: "task",
      sourceRecordId: id,
      title: input.title.trim(),
      status: input.status ?? "draft",
      summary: input.summary?.trim() || null,
      attention: "none",
      ownerRole: input.ownerRole?.trim() || null,
      nextAction: input.nextAction?.trim() || null,
      linkedConversationId: null,
      linkedProjectId: input.linkedProjectId || null,
      linkedWorkItemId: input.linkedWorkItemId || null,
      linkedTaskId: null,
      linkedRunId: null,
      updatedAt: now,
      priority: input.priority ?? null,
      assigneeName: input.assigneeName?.trim() || null,
      parentTaskId: input.parentTaskId || null,
      acceptanceCriteria: input.acceptanceCriteria?.trim() || null,
    };
    createdTasks.push(task);
    saveCreatedTasks();
    notify();
    return task;
  },
};

export function useTasks(): TasksSnapshot {
  return useSyncExternalStore(
    tasksStore.subscribe,
    tasksStore.getSnapshot,
    tasksStore.getSnapshot,
  );
}
