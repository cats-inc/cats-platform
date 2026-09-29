import type { CoreStore } from '../../../core/store.js';
import type { CoreArtifactRecord } from '../../../core/types.js';
import { upsertCoreArtifact } from '../../../core/model/planningRecords.js';
import type { CanvasSurfaceRef } from '../../shared/artifactCanvas/contracts.js';
import {
  isProcessLivePreviewProfile,
  type LivePreviewError,
  type LivePreviewStatus,
} from './contracts.js';
import type { LivePreviewSupervisor } from './supervisor.js';

/**
 * The previews of each Code conversation (SPEC-123 CAP-13/CAP-14): at most one
 * static lease and one dev server per conversation, their lifecycle when the
 * conversation's sessions end, and restarting a stopped or lost preview for
 * the artifact the canvas shows.
 */

export interface CodeConversationPreviewsOptions {
  supervisor: LivePreviewSupervisor | null;
  coreStore: Pick<CoreStore, 'readCore' | 'updateCore'>;
  /** Settings > Code "Cats may run preview servers", read before each dev restart. */
  previewServersEnabled(): Promise<boolean>;
  now?: () => Date;
  /** Delay before a closed conversation's previews stop, so a replaced session keeps them. */
  releaseGraceMs?: number;
}

export interface CodePreviewArtifactState {
  artifactId: string;
  previewId: string;
  profileId: string;
  kind: 'static' | 'dev';
  /** `missing` when this Platform process has no lease with that id, e.g. after a restart. */
  status: LivePreviewStatus | 'missing';
  previewUrl: string | null;
  stopReason: string | null;
  expiresAt: string | null;
  restartable: boolean;
}

export type CodePreviewRestartResult =
  | { status: 'ready'; previewId: string; previewUrl: string }
  | { status: 'rejected'; error: LivePreviewError | { code: string; message: string }; previewId?: string };

export interface CodeConversationPreviews {
  /** Current static lease per conversation, reused while it serves the same root. */
  staticLeases: Map<string, { previewId: string; root: string }>;
  /** The running dev preview per conversation (channel id → preview id). */
  devLeases: Map<string, string>;
  /** A session of the conversation ended; stop its previews unless another one takes over. */
  release(channelId: string, options: { immediate: boolean; stillInUse(): boolean }): void;
  /** A new session started for the conversation; keep its previews. */
  retain(channelId: string): void;
  stopConversation(channelId: string, reason: string): Promise<void>;
  describeArtifact(artifactId: string): Promise<CodePreviewArtifactState | null>;
  restartArtifact(artifactId: string): Promise<CodePreviewRestartResult>;
  clearForReset(): void;
}

interface PreviewMetadata {
  raw: Record<string, unknown>;
  previewId: string;
  commandProfileId: string;
  workspace: { id: string; rootPath: string };
  sourceSurface: CanvasSurfaceRef;
  artifactDirectory: string | null;
}

export function createCodeConversationPreviews(options: CodeConversationPreviewsOptions): CodeConversationPreviews {
  const staticLeases = new Map<string, { previewId: string; root: string }>();
  const devLeases = new Map<string, string>();
  const pendingReleases = new Map<string, ReturnType<typeof setTimeout>>();
  const now = options.now ?? (() => new Date());
  const graceMs = options.releaseGraceMs ?? 60_000;

  async function stopConversation(channelId: string, reason: string): Promise<void> {
    const supervisor = options.supervisor;
    staticLeases.delete(channelId);
    devLeases.delete(channelId);
    if (!supervisor) return;
    const active = supervisor.listLeases().filter((lease) =>
      lease.surface.kind === 'code_conversation'
      && lease.surface.surfaceId === channelId
      && (lease.status === 'ready' || lease.status === 'starting'));
    await Promise.all(active.map((lease) => supervisor.stop(lease.previewId, reason)));
  }

  async function findArtifact(artifactId: string): Promise<{ artifact: CoreArtifactRecord; meta: PreviewMetadata } | null> {
    const artifact = (await options.coreStore.readCore()).artifacts.find((entry) => entry.id === artifactId);
    const meta = artifact?.kind === 'preview' ? readPreviewMetadata(artifact) : null;
    return artifact && meta ? { artifact, meta } : null;
  }

  return {
    staticLeases,
    devLeases,
    release(channelId, { immediate, stillInUse }) {
      clearTimeout(pendingReleases.get(channelId));
      pendingReleases.delete(channelId);
      const stop = () => {
        pendingReleases.delete(channelId);
        if (!stillInUse()) void stopConversation(channelId, 'conversation_released');
      };
      if (immediate) {
        stop();
        return;
      }
      const timer = setTimeout(stop, graceMs);
      timer.unref?.();
      pendingReleases.set(channelId, timer);
    },
    retain(channelId) {
      clearTimeout(pendingReleases.get(channelId));
      pendingReleases.delete(channelId);
    },
    stopConversation,
    async describeArtifact(artifactId) {
      const found = await findArtifact(artifactId);
      if (!found) return null;
      const { artifact, meta } = found;
      const lease = options.supervisor?.getLease(meta.previewId) ?? null;
      const expired = lease?.status === 'ready' && Date.parse(lease.expiresAt) <= now().getTime();
      return {
        artifactId,
        previewId: meta.previewId,
        profileId: meta.commandProfileId,
        kind: isProcessLivePreviewProfile(meta.commandProfileId) ? 'dev' : 'static',
        status: lease ? (expired ? 'expired' : lease.status) : 'missing',
        previewUrl: artifact.path,
        stopReason: lease?.stopReason ?? null,
        expiresAt: lease?.expiresAt ?? null,
        restartable: meta.artifactDirectory !== null && meta.sourceSurface.kind === 'code_conversation',
      };
    },
    async restartArtifact(artifactId) {
      const supervisor = options.supervisor;
      if (!supervisor) {
        return rejected('previews_unavailable', 'Cats Code previews are not available on this host.');
      }
      const found = await findArtifact(artifactId);
      if (!found) return rejected('preview_not_found', 'That artifact is not a supervised preview.');
      const { artifact, meta } = found;
      const current = supervisor.getLease(meta.previewId);
      if (current?.status === 'ready' && Date.parse(current.expiresAt) > now().getTime()) {
        return { status: 'ready', previewId: current.previewId, previewUrl: artifact.path ?? current.origin };
      }
      if (!meta.artifactDirectory || meta.sourceSurface.kind !== 'code_conversation') {
        return rejected('restart_unavailable', 'This preview was recorded without what it needs to restart.');
      }
      const channelId = meta.sourceSurface.surfaceId;
      const dev = isProcessLivePreviewProfile(meta.commandProfileId);
      if (dev && !await options.previewServersEnabled()) {
        return rejected('preview_servers_disabled', 'Turn on "Cats may run preview servers" in Settings > Code.');
      }
      // One static lease and one dev server per conversation.
      const previous = dev ? devLeases.get(channelId) : staticLeases.get(channelId)?.previewId;
      if (previous && previous !== meta.previewId) await supervisor.stop(previous, 'replaced');
      if (current && (current.status === 'ready' || current.status === 'starting')) {
        await supervisor.stop(current.previewId, 'expired');
      }
      const started = await supervisor.start({
        commandProfileId: meta.commandProfileId,
        workspace: { kind: 'code_workspace', id: meta.workspace.id, rootPath: meta.workspace.rootPath },
        artifactDirectory: meta.artifactDirectory,
        surface: meta.sourceSurface,
      });
      if (started.status === 'rejected') {
        return { status: 'rejected', error: started.error, ...(started.previewId ? { previewId: started.previewId } : {}) };
      }
      const lease = supervisor.getLease(started.previewId)!;
      const entryPath = artifact.path ? new URL(artifact.path).pathname : '/';
      const previewUrl = entryPath === '/' ? lease.origin : new URL(entryPath, lease.origin).toString();
      await options.coreStore.updateCore((core) => {
        const latest = core.artifacts.find((entry) => entry.id === artifactId) ?? artifact;
        return upsertCoreArtifact(core, {
          id: latest.id,
          title: latest.title,
          kind: latest.kind,
          status: 'ready',
          projectId: latest.projectId,
          workItemId: latest.workItemId,
          conversationId: latest.conversationId,
          taskId: latest.taskId,
          path: previewUrl,
          summary: latest.summary,
          metadata: {
            ...latest.metadata,
            codeLivePreview: { ...meta.raw, previewId: lease.previewId },
          },
        }, now()).core;
      });
      supervisor.attachArtifact(lease.previewId, artifactId);
      if (dev) devLeases.set(channelId, lease.previewId);
      else staticLeases.set(channelId, { previewId: lease.previewId, root: meta.artifactDirectory });
      return { status: 'ready', previewId: lease.previewId, previewUrl };
    },
    clearForReset() {
      for (const timer of pendingReleases.values()) clearTimeout(timer);
      pendingReleases.clear();
      staticLeases.clear();
      devLeases.clear();
    },
  };
}

function readPreviewMetadata(artifact: CoreArtifactRecord): PreviewMetadata | null {
  const raw = asRecord(artifact.metadata.codeLivePreview);
  const workspace = asRecord(raw?.workspace);
  const surface = asRecord(raw?.sourceSurface);
  const previewId = typeof raw?.previewId === 'string' ? raw.previewId : null;
  const commandProfileId = typeof raw?.commandProfileId === 'string' ? raw.commandProfileId : null;
  if (!raw || !previewId || !commandProfileId || typeof workspace?.id !== 'string'
    || typeof workspace.rootPath !== 'string' || typeof surface?.kind !== 'string'
    || typeof surface.surfaceId !== 'string') {
    return null;
  }
  return {
    raw,
    previewId,
    commandProfileId,
    workspace: { id: workspace.id, rootPath: workspace.rootPath },
    sourceSurface: { kind: surface.kind as CanvasSurfaceRef['kind'], surfaceId: surface.surfaceId },
    artifactDirectory: typeof raw.artifactDirectory === 'string' ? raw.artifactDirectory : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rejected(code: string, message: string): CodePreviewRestartResult {
  return { status: 'rejected', error: { code, message } };
}
