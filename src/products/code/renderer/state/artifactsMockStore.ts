import { useSyncExternalStore } from "react";

/**
 * Mock Artifacts store for Cats Code sidebar preview.
 *
 * Replace with `buildCodeArtifactListProjection` once the route is wired
 * end-to-end. The shape here is a renderer-only subset of
 * `CodeArtifactListItem` plus a codespace cross-link so the mock list
 * page can show provenance.
 */

export type CodeArtifactKind =
  | "build"
  | "preview"
  | "document"
  | "report"
  | "attachment"
  | "transcript_export"
  | "dataset";

export type CodeArtifactStatus =
  | "ready"
  | "draft"
  | "published"
  | "archived"
  | "failed";

export interface CodeArtifactMock {
  id: string;
  title: string;
  summary: string | null;
  kind: CodeArtifactKind;
  status: CodeArtifactStatus;
  path: string | null;
  workspaceId: string | null;
  workspaceTitle: string | null;
  taskTitle: string | null;
  runId: string | null;
  conversationTitle: string | null;
  updatedAt: string;
}

const NOW = new Date("2026-04-28T18:00:00.000Z").getTime();
const RELATIVE_HOUR = 60 * 60 * 1000;

const SEED_ARTIFACTS: readonly CodeArtifactMock[] = [
  {
    id: "art-build-cats-platform-2026-04-28",
    title: "cats-platform build #284",
    summary: "Successful production build with the projectionSupport refactor",
    kind: "build",
    status: "ready",
    path: "dist/cats-platform/build-284.tar.gz",
    workspaceId: "ws-cats-platform",
    workspaceTitle: "cats-platform",
    taskTitle: "Tighten chat productBinding rule",
    runId: "run-build-284",
    conversationTitle: "fix(work): productBinding precedence",
    updatedAt: new Date(NOW - 2 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "art-preview-pomodoro",
    title: "pomodoro-app preview (localhost:5180)",
    summary: "Live preview produced from the Pomodoro quick prompt",
    kind: "preview",
    status: "ready",
    path: "http://127.0.0.1:5180",
    workspaceId: "ws-pomodoro-app",
    workspaceTitle: "pomodoro-app",
    taskTitle: "Pomodoro app",
    runId: "run-pomodoro-001",
    conversationTitle: "Pomodoro draft session",
    updatedAt: new Date(NOW - 22 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "art-report-paperclip-comparison",
    title: "Paperclip vs Cats Work feature gap",
    summary:
      "Long-form comparison report drafted from the paperclip codespace conversation",
    kind: "report",
    status: "draft",
    path: "paperclip/reports/2026-04-feature-gap.md",
    workspaceId: "ws-paperclip",
    workspaceTitle: "paperclip",
    taskTitle: "Paperclip competitor sweep",
    runId: null,
    conversationTitle: "Paperclip teardown",
    updatedAt: new Date(NOW - 3 * 24 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "art-document-spec-091-draft",
    title: "SPEC-091 working draft",
    summary: "Codespace + Artifact sidebar spec, not yet committed",
    kind: "document",
    status: "draft",
    path: "cats-platform/docs/specs/SPEC-091-cats-code-workspace-and-artifact-sidebar.md",
    workspaceId: "ws-cats-platform",
    workspaceTitle: "cats-platform",
    taskTitle: "Document Code sidebar IA",
    runId: null,
    conversationTitle: "Sidebar IA review",
    updatedAt: new Date(NOW - 8 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "art-build-cats-platform-failed",
    title: "cats-platform build #283",
    summary: "Build failed: type error in workGraphProjection.ts (since fixed)",
    kind: "build",
    status: "failed",
    path: "dist/cats-platform/build-283.log",
    workspaceId: "ws-cats-platform",
    workspaceTitle: "cats-platform",
    taskTitle: "Tighten chat productBinding rule",
    runId: "run-build-283",
    conversationTitle: "fix(work): productBinding precedence",
    updatedAt: new Date(NOW - 4 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "art-attachment-runtime-log",
    title: "runtime-session-7cd429d0.log",
    summary: "Raw runtime log from the QQ launch managed-room session",
    kind: "attachment",
    status: "archived",
    path: "C:\\Users\\middl\\.cats\\runtime\\sessions\\7cd429d0\\session.log",
    workspaceId: "ws-managed-room-q-launch",
    workspaceTitle: "QQ launch room",
    taskTitle: null,
    runId: null,
    conversationTitle: "QQ launch",
    updatedAt: new Date(NOW - 14 * 24 * RELATIVE_HOUR).toISOString(),
  },
  {
    id: "art-transcript-pomodoro",
    title: "Pomodoro design transcript",
    summary: "Exported chat transcript that produced the preview",
    kind: "transcript_export",
    status: "published",
    path: "exports/pomodoro/design-transcript.md",
    workspaceId: "ws-pomodoro-app",
    workspaceTitle: "pomodoro-app",
    taskTitle: "Pomodoro app",
    runId: null,
    conversationTitle: "Pomodoro draft session",
    updatedAt: new Date(NOW - 23 * RELATIVE_HOUR).toISOString(),
  },
];

const listeners = new Set<() => void>();

let cachedSnapshot: { artifacts: readonly CodeArtifactMock[] } | null = null;

function rebuildSnapshot(): { artifacts: readonly CodeArtifactMock[] } {
  return { artifacts: SEED_ARTIFACTS };
}

function getSnapshot(): { artifacts: readonly CodeArtifactMock[] } {
  if (!cachedSnapshot) cachedSnapshot = rebuildSnapshot();
  return cachedSnapshot;
}

export interface ArtifactsMockSnapshot {
  artifacts: readonly CodeArtifactMock[];
}

export function useArtifactsMock(): ArtifactsMockSnapshot {
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

export const ARTIFACT_KIND_LABELS: Record<CodeArtifactKind, string> = {
  build: "Build",
  preview: "Preview",
  document: "Document",
  report: "Report",
  attachment: "Attachment",
  transcript_export: "Transcript",
  dataset: "Dataset",
};
