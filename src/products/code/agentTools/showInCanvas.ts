import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';

import type { CatsCoreState } from '../../../core/types.js';
import { mcpTextResult, type McpToolCallResult, type McpToolDefinition } from '../../../platform/mcp/jsonRpcServer.js';
import { appendArtifactCanvasIntentActivity } from '../../shared/artifactCanvas/activity.js';
import {
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  type ArtifactCanvasPresentationInput,
  type CanvasSurfaceRef,
} from '../../shared/artifactCanvas/contracts.js';
import type {
  ArtifactCanvasPolicyConfig,
  ArtifactCanvasSupervisorPreviewLeaseStore,
} from '../../shared/artifactCanvas/iframePolicy.js';
import { buildArtifactCanvasProjection } from '../../shared/artifactCanvas/projection.js';
import {
  createArtifactCanvasIntentId,
  type ArtifactCanvasRenderIntentHub,
} from '../../shared/artifactCanvas/renderIntent.js';
import { materializeLivePreviewArtifactAndShowInCanvas } from '../livePreview/artifactMaterialization.js';
import { STATIC_LIVE_PREVIEW_PROFILE } from '../livePreview/contracts.js';
import type { LivePreviewSupervisor } from '../livePreview/supervisor.js';
import { CODE_ARTIFACT_DECLARATION_TOOL, CodeArtifactDeclarationError } from '../shared/artifactDeclaration.js';
import { materializeCodeArtifactDeclaration } from '../state/artifactMaterialization.js';
import type { CodeAgentToolGrantBinding } from './contracts.js';

/**
 * SPEC-123 `show_in_canvas`: open a workspace file, an https URL or an existing
 * artifact in the canvas beside this Code conversation, in one call.
 */

export const SHOW_IN_CANVAS_TOOL: McpToolDefinition = {
  name: 'show_in_canvas',
  description: [
    'Open something a person should look at in the preview canvas beside this Cats Code conversation.',
    'Pass exactly one of: path (a workspace HTML page, a directory with index.html, an image, a PDF or a text file),',
    'url (an https page, shown without scripts) or artifactId.',
    'HTML pages run with scripts on an isolated preview origin; edits show on refresh.',
    'Use start_dev_preview instead for projects that need a dev server or bundler.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      path: { type: 'string', minLength: 1 },
      url: { type: 'string', minLength: 1 },
      artifactId: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      presentation: { type: 'string', enum: ['auto', 'iframe', 'image', 'pdf', 'code'] },
    },
  },
};

const PAGE_EXTENSIONS = new Set(['.html', '.htm']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);
const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.csv', '.css', '.js', '.mjs', '.ts', '.tsx', '.log', '.diff', '.patch',
]);
const PRESENTATIONS = new Set<ArtifactCanvasPresentationInput>(['auto', 'iframe', 'image', 'pdf', 'code']);

export interface ShowInCanvasContext {
  binding: CodeAgentToolGrantBinding;
  runtimeSessionId: string | null;
  updateCore(mutator: (core: CatsCoreState) => CatsCoreState): Promise<unknown>;
  supervisor: LivePreviewSupervisor | null;
  /** Current static lease per conversation, reused while it serves the same root. */
  staticLeases: Map<string, { previewId: string; root: string }>;
  policyConfig: ArtifactCanvasPolicyConfig;
  hub: ArtifactCanvasRenderIntentHub;
  now(): Date;
}

type ShowFailure = { code: string; message: string };

export async function runShowInCanvas(
  args: Record<string, unknown>,
  context: ShowInCanvasContext,
): Promise<McpToolCallResult> {
  const identities = (['path', 'url', 'artifactId'] as const).filter((key) => typeof args[key] === 'string');
  if (identities.length !== 1) {
    return failure({ code: 'identity_required', message: 'Pass exactly one of path, url or artifactId.' });
  }
  const presentation = (args.presentation ?? 'auto') as ArtifactCanvasPresentationInput;
  if (!PRESENTATIONS.has(presentation)) {
    return failure({ code: 'presentation_invalid', message: 'presentation must be auto, iframe, image, pdf or code.' });
  }
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  const surface: CanvasSurfaceRef = { kind: 'code_conversation', surfaceId: context.binding.channelId };
  try {
    if (identities[0] === 'path') {
      return await showWorkspacePath(String(args.path), presentation, title, surface, context);
    }
    if (identities[0] === 'url') {
      return await showUrl(String(args.url), presentation, title, surface, context);
    }
    return await showArtifact(String(args.artifactId), presentation, surface, context);
  } catch (error) {
    if (error instanceof CodeArtifactDeclarationError) {
      return failure({ code: error.code, message: error.message });
    }
    throw error;
  }
}

async function showWorkspacePath(
  requestedPath: string,
  requestedPresentation: ArtifactCanvasPresentationInput,
  title: string,
  surface: CanvasSurfaceRef,
  context: ShowInCanvasContext,
): Promise<McpToolCallResult> {
  if (!context.supervisor) {
    return failure({ code: 'previews_unavailable', message: 'Cats Code previews are not available on this host.' });
  }
  const workspace = context.binding.workspacePath;
  if (!workspace) {
    return failure({ code: 'workspace_unknown', message: 'This conversation has no workspace to preview from.' });
  }
  const target = await resolveWorkspaceTarget(workspace, requestedPath);
  if ('code' in target) return failure(target);

  const extension = target.isDirectory ? '.html' : extname(target.path).toLowerCase();
  const presentation = requestedPresentation !== 'auto'
    ? requestedPresentation
    : PAGE_EXTENSIONS.has(extension) ? 'auto'
      : IMAGE_EXTENSIONS.has(extension) ? 'image'
        : extension === '.pdf' ? 'pdf'
          : TEXT_EXTENSIONS.has(extension) ? 'code'
            : null;
  if (!presentation) {
    return failure({
      code: 'presentation_unsupported',
      message: `The canvas cannot show ${extension || 'this file type'} yet. Use declare_artifact to record it instead.`,
    });
  }
  const root = target.isDirectory ? target.path : dirname(target.path);
  const entryPath = target.isDirectory ? '/' : `/${encodeURIComponent(basename(target.path))}`;

  const lease = await ensureStaticLease(root, target.workspaceRoot, surface, context);
  if ('code' in lease) return failure(lease);

  let shown!: ReturnType<typeof materializeLivePreviewArtifactAndShowInCanvas>;
  await context.updateCore((core) => {
    shown = materializeLivePreviewArtifactAndShowInCanvas(core, lease, {
      entryPath,
      title: title || basename(target.path),
      presentationRequested: presentation,
      actorId: context.binding.actorId,
      policyConfig: context.policyConfig,
      supervisorPreviewLeaseStore: context.supervisor,
      renderIntentHub: context.hub,
      now: context.now(),
    });
    return shown.core;
  });
  if (shown.status === 'skipped') {
    return failure({ code: shown.reason, message: `The preview could not be shown (${shown.reason}).` });
  }
  if (shown.status === 'rejected') {
    return failure({ code: shown.error.code, message: shown.error.message });
  }
  context.supervisor.attachArtifact(lease.previewId, shown.artifact.id);
  return mcpTextResult({
    artifactId: shown.artifact.id,
    canvasPath: shown.intent.targetUrl,
    previewUrl: shown.artifact.path,
    previewId: lease.previewId,
  });
}

async function resolveWorkspaceTarget(
  workspace: string,
  requestedPath: string,
): Promise<{ path: string; isDirectory: boolean; workspaceRoot: string } | ShowFailure> {
  let workspaceRoot: string;
  try {
    workspaceRoot = await realpath(workspace);
  } catch {
    return { code: 'workspace_unknown', message: 'The conversation workspace does not exist.' };
  }
  const candidate = isAbsolute(requestedPath) ? requestedPath : join(workspaceRoot, requestedPath);
  let resolved: string;
  try {
    resolved = await realpath(candidate);
  } catch {
    return { code: 'path_not_found', message: `No file or directory at ${requestedPath}.` };
  }
  const inside = relative(workspaceRoot, resolved);
  if (inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) {
    return { code: 'path_outside_workspace', message: 'The path must stay inside the conversation workspace.' };
  }
  if (inside.split(sep).some((segment) => segment.startsWith('.'))) {
    return { code: 'path_not_allowed', message: 'Hidden files and directories cannot be previewed.' };
  }
  const info = await stat(resolved);
  if (info.isDirectory()) {
    try {
      await stat(join(resolved, 'index.html'));
    } catch {
      return { code: 'index_missing', message: 'The directory has no index.html to open.' };
    }
  }
  return { path: resolved, isDirectory: info.isDirectory(), workspaceRoot };
}

async function ensureStaticLease(
  root: string,
  workspaceRoot: string,
  surface: CanvasSurfaceRef,
  context: ShowInCanvasContext,
) {
  const supervisor = context.supervisor!;
  const current = context.staticLeases.get(surface.surfaceId);
  if (current) {
    const lease = supervisor.getLease(current.previewId);
    if (lease?.status === 'ready' && current.root === root) return lease;
    await supervisor.stop(current.previewId, 'replaced');
    context.staticLeases.delete(surface.surfaceId);
  }
  const started = await supervisor.start({
    commandProfileId: STATIC_LIVE_PREVIEW_PROFILE.id,
    workspace: { kind: 'code_workspace', id: `code-conversation:${surface.surfaceId}`, rootPath: workspaceRoot },
    artifactDirectory: root,
    surface,
  });
  if (started.status === 'rejected') {
    return { code: started.error.code, message: started.error.message };
  }
  context.staticLeases.set(surface.surfaceId, { previewId: started.previewId, root });
  return supervisor.getLease(started.previewId)!;
}

async function showUrl(
  url: string,
  presentation: ArtifactCanvasPresentationInput,
  title: string,
  surface: CanvasSurfaceRef,
  context: ShowInCanvasContext,
): Promise<McpToolCallResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return failure({ code: 'url_invalid', message: 'url must be an absolute https URL.' });
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return failure({
      code: 'url_not_allowed',
      message: 'Only https URLs can be shown directly. Use path for workspace files.',
    });
  }
  const declaration = CODE_ARTIFACT_DECLARATION_TOOL.createDeclaration(
    CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
      declarationId: `url-${createHash('sha256').update(parsed.toString()).digest('hex').slice(0, 16)}`,
      label: 'preview_url',
      title: title || parsed.host,
      location: { kind: 'url', value: parsed.toString() },
    }),
    { kind: 'agent', actorId: context.binding.actorId, runtimeSessionId: context.runtimeSessionId },
    { conversationId: context.binding.conversationId, workspacePath: context.binding.workspacePath },
  );
  let artifactId = '';
  await context.updateCore((core) => {
    const materialized = materializeCodeArtifactDeclaration(core, declaration, context.now());
    artifactId = materialized.artifact.id;
    return materialized.core;
  });
  return showArtifact(artifactId, presentation, surface, context);
}

async function showArtifact(
  artifactId: string,
  presentation: ArtifactCanvasPresentationInput,
  surface: CanvasSurfaceRef,
  context: ShowInCanvasContext,
): Promise<McpToolCallResult> {
  let outcome: McpToolCallResult | null = null;
  let intent: ReturnType<typeof composeArtifactCanvasNavigateIntent> | null = null;
  const at = context.now();
  await context.updateCore((core) => {
    const projection = buildArtifactCanvasProjection({
      core,
      surface,
      artifactId,
      presentationRequested: presentation,
      policyConfig: context.policyConfig,
      supervisorPreviewLeaseStore: context.supervisor as ArtifactCanvasSupervisorPreviewLeaseStore | null,
      now: context.now(),
    });
    if (projection.status === 'error') {
      outcome = failure({ code: projection.error.code, message: projection.error.message });
      return core;
    }
    const targetUrl = canvasSurfaceRouteRegistry.canvasUrl(surface, artifactId, presentation);
    const activity = appendArtifactCanvasIntentActivity({
      core,
      kind: 'artifact_canvas_show_intent',
      surface,
      actorId: context.binding.actorId,
      artifactId,
      targetUrl,
      policyVersion: projection.projection.policyVersion,
      presentationRequested: projection.projection.presentationRequested,
      presentationResolved: projection.projection.presentationResolved,
      iframeSandboxProfile: projection.projection.iframeSandboxProfile,
      now: at,
    });
    intent = composeArtifactCanvasNavigateIntent({
      intentId: createArtifactCanvasIntentId(),
      activityId: activity.activity.id,
      surface,
      artifactId,
      presentationRequested: projection.projection.presentationRequested,
      policyVersion: projection.projection.policyVersion,
      triggeredAt: at.toISOString(),
    });
    outcome = mcpTextResult({
      artifactId,
      canvasPath: targetUrl,
      presentation: projection.projection.presentationResolved,
    });
    return activity.core;
  });
  // Publish only once the Activity is durable.
  if (intent) context.hub.publish({ intent, now: at });
  return outcome!;
}

function failure(error: ShowFailure): McpToolCallResult {
  return mcpTextResult({ error }, true);
}
