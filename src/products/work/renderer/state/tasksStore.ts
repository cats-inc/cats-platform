import { useEffect, useSyncExternalStore } from "react";

import {
  createWorkTask,
  listWorkTasks,
  removeWorkTask,
  type CoreTaskRecord,
  type CoreTaskStatus,
} from "../api/workRecords.js";
import { MOCK_WORK_GRAPH } from "../components/topdown/mock";
import type { WorkGraphObjectSummary } from "../components/topdown/types";

const STORAGE_KEY_DELETED = "cats-work:deleted-tasks";
const TASK_RENDERER_METADATA_KEY = "workRenderer";

type FetchStatus = "idle" | "loading" | "ready" | "error";

export type TaskPriority = "urgent" | "high" | "medium" | "low";

/**
 * Renderer-side Task display shape. Extends WorkGraphObjectSummary so
 * the SPEC-090 LinkageSection / Phase 5 producer pipeline can resolve
 * a task as a link endpoint without a separate adapter. Adds
 * Paperclip-inspired display fields (priority / assignee / parent /
 * acceptance criteria) — these are persisted in CoreTaskRecord.metadata
 * under the `workRenderer` key.
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

const rendererHidden = new Set<string>(loadStringSet(STORAGE_KEY_DELETED));
let coreTasks: TaskItem[] = [];
let fetchStatus: FetchStatus = "idle";
let fetchError: string | null = null;
let inflight: Promise<void> | null = null;

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

function notify(): void {
  snapshotVersion += 1;
  cachedSnapshot = null;
  for (const l of listeners) l();
}

export interface TasksSnapshot {
  version: number;
  allTasks: readonly TaskItem[];
  deletedIds: ReadonlySet<string>;
  status: FetchStatus;
  error: string | null;
}

function asTaskRendererExtras(value: unknown): {
  priority: TaskPriority | null;
  assigneeName: string | null;
  acceptanceCriteria: string | null;
} {
  if (!value || typeof value !== "object") {
    return { priority: null, assigneeName: null, acceptanceCriteria: null };
  }
  const record = value as Record<string, unknown>;
  const priority = record.priority;
  const validPriority =
    priority === "urgent" || priority === "high" || priority === "medium" || priority === "low";
  return {
    priority: validPriority ? (priority as TaskPriority) : null,
    assigneeName:
      typeof record.assigneeName === "string" ? record.assigneeName : null,
    acceptanceCriteria:
      typeof record.acceptanceCriteria === "string"
        ? record.acceptanceCriteria
        : null,
  };
}

function taskRecordToItem(record: CoreTaskRecord): TaskItem {
  const extras = asTaskRendererExtras(record.metadata?.[TASK_RENDERER_METADATA_KEY]);
  return {
    id: record.id,
    kind: "task",
    structuralLayer: "execution",
    sourceRecordFamily: "task",
    sourceRecordId: record.id,
    title: record.title,
    status: record.status,
    summary: record.summary,
    attention: "none",
    ownerRole: null,
    nextAction: null,
    linkedConversationId: record.conversationId,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: null,
    linkedRunId: null,
    updatedAt: record.updatedAt,
    priority: extras.priority,
    assigneeName: extras.assigneeName,
    parentTaskId: record.parentTaskId ?? null,
    acceptanceCriteria: extras.acceptanceCriteria,
  };
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
  const byId = new Map<string, TaskItem>();
  for (const task of mockTasks) byId.set(task.id, task);
  for (const task of coreTasks) byId.set(task.id, task);
  cachedSnapshot = {
    version: snapshotVersion,
    allTasks: Array.from(byId.values()),
    deletedIds: new Set(rendererHidden),
    status: fetchStatus,
    error: fetchError,
  };
  return cachedSnapshot;
}

async function fetchOnce(): Promise<void> {
  if (inflight) return inflight;
  fetchStatus = "loading";
  fetchError = null;
  notify();
  inflight = (async () => {
    try {
      const records = await listWorkTasks();
      coreTasks = records.map(taskRecordToItem);
      fetchStatus = "ready";
      fetchError = null;
    } catch (err) {
      fetchStatus = "error";
      fetchError = err instanceof Error ? err.message : "Failed to load tasks.";
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

export interface CreateTaskInput {
  title: string;
  summary?: string | null;
  status?: CoreTaskStatus;
  priority?: TaskPriority | null;
  ownerRole?: string | null;
  assigneeName?: string | null;
  nextAction?: string | null;
  acceptanceCriteria?: string | null;
  linkedProjectId?: string | null;
  linkedWorkItemId?: string | null;
  parentTaskId?: string | null;
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
  refresh(): Promise<void> {
    fetchStatus = "idle";
    notify();
    return fetchOnce();
  },
  isDeleted(id: string): boolean {
    return rendererHidden.has(id);
  },
  async remove(id: string): Promise<void> {
    if (rendererHidden.has(id)) return;
    const isCoreRecord = coreTasks.some((t) => t.id === id);
    if (isCoreRecord) {
      try {
        await removeWorkTask(id);
        coreTasks = coreTasks.filter((t) => t.id !== id);
      } catch {
        rendererHidden.add(id);
        saveStringSet(STORAGE_KEY_DELETED, rendererHidden);
      }
    } else {
      rendererHidden.add(id);
      saveStringSet(STORAGE_KEY_DELETED, rendererHidden);
    }
    notify();
  },
  async createTask(input: CreateTaskInput): Promise<TaskItem> {
    const result = await createWorkTask({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
      parentTaskId: input.parentTaskId || null,
    });
    // Stitch renderer-only extras into the returned record's metadata
    // copy so the snapshot reflects them; the next refresh will read
    // from server. (Actual server-side persistence of these extras
    // requires the create payload to carry metadata; for now we stash
    // them locally on the in-memory record.)
    const extras = {
      priority: input.priority ?? null,
      assigneeName: input.assigneeName?.trim() || null,
      acceptanceCriteria: input.acceptanceCriteria?.trim() || null,
    };
    const item: TaskItem = {
      ...taskRecordToItem(result.task),
      ...extras,
    };
    coreTasks = [...coreTasks.filter((t) => t.id !== item.id), item];
    notify();
    return item;
  },
};

export function useTasks(): TasksSnapshot {
  const snapshot = useSyncExternalStore(
    tasksStore.subscribe,
    tasksStore.getSnapshot,
    tasksStore.getSnapshot,
  );
  useEffect(() => {
    if (snapshot.status === "idle") {
      void fetchOnce();
    }
  }, [snapshot.status]);
  return snapshot;
}

/** Test-only escape hatch — resets the singleton state. */
export function __resetTasksStoreForTest(): void {
  coreTasks = [];
  fetchStatus = "idle";
  fetchError = null;
  inflight = null;
  rendererHidden.clear();
  notify();
}
