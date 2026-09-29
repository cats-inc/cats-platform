import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { CatsCoreState } from '../../../core/types.js';
import { mcpTextResult, type McpToolCallResult, type McpToolDefinition } from '../../../platform/mcp/jsonRpcServer.js';
import type { CanvasSurfaceRef } from '../../shared/artifactCanvas/contracts.js';
import type { ArtifactCanvasPolicyConfig } from '../../shared/artifactCanvas/iframePolicy.js';
import type { ArtifactCanvasRenderIntentHub } from '../../shared/artifactCanvas/renderIntent.js';
import { materializeLivePreviewArtifactAndShowInCanvas } from '../livePreview/artifactMaterialization.js';
import { VITE_LIVE_PREVIEW_PROFILE } from '../livePreview/contracts.js';
import type { LivePreviewSupervisor } from '../livePreview/supervisor.js';
import type { CodeAgentToolGrantBinding } from './contracts.js';
import { resolveWorkspacePath, type ShowFailure } from './showInCanvas.js';

/**
 * SPEC-123 dev previews: `start_dev_preview`, `get_preview_status` and
 * `stop_preview`. A dev server runs only through a reviewed profile (Vite),
 * never an assistant-supplied command, and only when the user allows preview
 * servers and the session can already run shell commands (CAP-07/08/09).
 */

const SCRIPT_NAME = /^[A-Za-z0-9:_.-]+$/u;
const DEFAULT_LOG_LINES = 80;
const MAX_LOG_LINES = 200;

export const START_DEV_PREVIEW_TOOL: McpToolDefinition = {
  name: 'start_dev_preview',
  description: [
    'Start the dev server of a web project in this conversation\'s workspace and open it in the preview canvas.',
    'Pass directory (the folder that has package.json); script defaults to "dev". Vite projects are supported.',
    'Install dependencies first (npm install in that folder). If the start fails, read logTail, fix the cause',
    'and call it again. A new call replaces this conversation\'s running dev preview. The page hot-reloads',
    'after edits, so there is no need to restart it for code changes.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['directory'],
    properties: {
      directory: { type: 'string', minLength: 1 },
      script: { type: 'string', minLength: 1, pattern: SCRIPT_NAME.source },
      title: { type: 'string', minLength: 1 },
    },
  },
};

export const GET_PREVIEW_STATUS_TOOL: McpToolDefinition = {
  name: 'get_preview_status',
  description: 'Read the status and recent log lines of a preview started in this conversation.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['previewId'],
    properties: {
      previewId: { type: 'string', minLength: 1 },
      logLines: { type: 'integer', minimum: 1, maximum: MAX_LOG_LINES },
    },
  },
};

export const STOP_PREVIEW_TOOL: McpToolDefinition = {
  name: 'stop_preview',
  description: 'Stop a preview started in this conversation. Stopping a stopped preview is fine.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['previewId'],
    properties: {
      previewId: { type: 'string', minLength: 1 },
    },
  },
};

export interface DevPreviewContext {
  binding: CodeAgentToolGrantBinding;
  supervisor: LivePreviewSupervisor | null;
  /** The running dev preview per conversation (channel id → preview id). */
  devLeases: Map<string, string>;
  /** Static leases per conversation, forgotten when the agent stops one. */
  staticLeases: Map<string, { previewId: string; root: string }>;
  /** Settings > Code "Cats may run preview servers", read for each start. */
  previewServersEnabled(): Promise<boolean>;
  updateCore(mutator: (core: CatsCoreState) => CatsCoreState): Promise<unknown>;
  policyConfig: ArtifactCanvasPolicyConfig;
  hub: ArtifactCanvasRenderIntentHub;
  now(): Date;
}

export async function runStartDevPreview(
  args: Record<string, unknown>,
  context: DevPreviewContext,
): Promise<McpToolCallResult> {
  const supervisor = context.supervisor;
  if (!supervisor) {
    return failure({ code: 'previews_unavailable', message: 'Cats Code previews are not available on this host.' });
  }
  if (!await context.previewServersEnabled()) {
    return failure({
      code: 'preview_servers_disabled',
      message: 'The user has not allowed Cats to run preview servers. Tell them they can turn on '
        + '"Cats may run preview servers" in Settings > Code, or build static files and use show_in_canvas.',
    });
  }
  if (!context.binding.shellExecution) {
    return failure({
      code: 'shell_permission_required',
      message: 'This session cannot run shell commands, so it cannot start a dev server. '
        + 'Build static files and use show_in_canvas instead.',
    });
  }
  const workspace = context.binding.workspacePath;
  if (!workspace) {
    return failure({ code: 'workspace_unknown', message: 'This conversation has no workspace to preview from.' });
  }
  if (typeof args.directory !== 'string' || !args.directory.trim()) {
    return failure({ code: 'directory_required', message: 'Pass directory, the folder that has package.json.' });
  }
  const script = args.script === undefined ? 'dev' : args.script;
  if (typeof script !== 'string' || !SCRIPT_NAME.test(script)) {
    return failure({ code: 'script_invalid', message: 'script must be a package.json script name such as "dev".' });
  }
  const title = typeof args.title === 'string' ? args.title.trim() : '';

  const target = await resolveWorkspacePath(workspace, args.directory);
  if ('code' in target) return failure(target);
  if (!target.isDirectory) {
    return failure({ code: 'directory_required', message: 'directory must be a folder that has package.json.' });
  }
  const detected = await detectViteDevScript(target.path, script);
  if (detected) return failure(detected);

  const surface: CanvasSurfaceRef = { kind: 'code_conversation', surfaceId: context.binding.channelId };
  const current = context.devLeases.get(surface.surfaceId);
  if (current) {
    await supervisor.stop(current, 'replaced');
    context.devLeases.delete(surface.surfaceId);
  }
  const started = await supervisor.start({
    commandProfileId: VITE_LIVE_PREVIEW_PROFILE.id,
    // A distinct id per conversation keeps one dev preview per conversation.
    workspace: { kind: 'code_workspace', id: `code-conversation:${surface.surfaceId}:dev`, rootPath: target.workspaceRoot },
    artifactDirectory: target.path,
    surface,
    artifactTitle: title || null,
  });
  if (started.status === 'rejected') {
    return failure(
      { code: started.error.code, message: started.error.message },
      started.previewId ? readLogTail(supervisor, started.previewId, DEFAULT_LOG_LINES) : '',
    );
  }
  context.devLeases.set(surface.surfaceId, started.previewId);
  const lease = supervisor.getLease(started.previewId)!;

  let shown!: ReturnType<typeof materializeLivePreviewArtifactAndShowInCanvas>;
  await context.updateCore((core) => {
    shown = materializeLivePreviewArtifactAndShowInCanvas(core, lease, {
      entryPath: '/',
      title: title || basename(target.path),
      presentationRequested: 'auto',
      actorId: context.binding.actorId,
      policyConfig: context.policyConfig,
      supervisorPreviewLeaseStore: supervisor,
      renderIntentHub: context.hub,
      now: context.now(),
    });
    return shown.core;
  });
  if (shown.status === 'skipped') {
    return failure({ code: shown.reason, message: `The preview started but could not be shown (${shown.reason}).` });
  }
  if (shown.status === 'rejected') {
    return failure({ code: shown.error.code, message: shown.error.message });
  }
  supervisor.attachArtifact(lease.previewId, shown.artifact.id);
  return mcpTextResult({
    previewId: lease.previewId,
    artifactId: shown.artifact.id,
    canvasPath: shown.intent.targetUrl,
    previewUrl: `${lease.origin}/`,
    profileId: lease.commandProfileId,
  });
}

export function runGetPreviewStatus(
  args: Record<string, unknown>,
  context: Pick<DevPreviewContext, 'binding' | 'supervisor'>,
): McpToolCallResult {
  const lease = ownedLease(args.previewId, context);
  if ('code' in lease) return failure(lease);
  const requested = typeof args.logLines === 'number' && Number.isInteger(args.logLines) ? args.logLines : DEFAULT_LOG_LINES;
  const lines = Math.min(MAX_LOG_LINES, Math.max(1, requested));
  return mcpTextResult({
    status: lease.status,
    profileId: lease.commandProfileId,
    ...(lease.status === 'ready' ? { previewUrl: `${lease.origin}/` } : {}),
    ...(lease.stopReason ? { diagnostics: { stopReason: lease.stopReason } } : {}),
    logTail: readLogTail(context.supervisor!, lease.previewId, lines),
  });
}

export async function runStopPreview(
  args: Record<string, unknown>,
  context: Pick<DevPreviewContext, 'binding' | 'supervisor' | 'devLeases' | 'staticLeases'>,
): Promise<McpToolCallResult> {
  const lease = ownedLease(args.previewId, context);
  if ('code' in lease) return failure(lease);
  const stopped = await context.supervisor!.stop(lease.previewId, 'agent_stop');
  if (stopped.status === 'rejected') {
    return failure({ code: stopped.error.code, message: stopped.error.message });
  }
  const channelId = context.binding.channelId;
  if (context.devLeases.get(channelId) === lease.previewId) context.devLeases.delete(channelId);
  if (context.staticLeases.get(channelId)?.previewId === lease.previewId) context.staticLeases.delete(channelId);
  return mcpTextResult({ status: 'stopped' });
}

/**
 * CAP-07: the `script` must run Vite's dev server, and Vite must be installed
 * in the directory's own `node_modules`, which is the entry the profile runs.
 */
export async function detectViteDevScript(directory: string, script: string): Promise<ShowFailure | null> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { code: 'package_json_missing', message: 'The directory has no package.json.' }
      : { code: 'package_json_invalid', message: 'package.json is not valid JSON.' };
  }
  const scripts = isRecord(manifest) && isRecord(manifest.scripts) ? manifest.scripts : {};
  const command = scripts[script];
  if (typeof command !== 'string') {
    const names = Object.keys(scripts);
    return {
      code: 'script_missing',
      message: `package.json has no "${script}" script (scripts: ${names.length ? names.join(', ') : 'none'}).`,
    };
  }
  if (!isViteDevCommand(command)) {
    return {
      code: 'profile_unsupported',
      message: `Only Vite dev servers can be started; the "${script}" script runs \`${command}\`. `
        + 'Build static files and open them with show_in_canvas instead.',
    };
  }
  try {
    await stat(join(directory, 'node_modules', 'vite', 'bin', 'vite.js'));
  } catch {
    return {
      code: 'dependencies_missing',
      message: 'Vite is not installed in this project. Run npm install in that folder, then call start_dev_preview again.',
    };
  }
  return null;
}

/** `vite`, `vite dev` or `vite serve`, with any flags; the profile sets host and port. */
export function isViteDevCommand(command: string): boolean {
  const tokens = command.trim().split(/\s+/u);
  if (tokens[0] !== 'vite') return false;
  const subcommand = tokens[1] && !tokens[1].startsWith('-') ? tokens[1] : null;
  return subcommand === null || subcommand === 'dev' || subcommand === 'serve';
}

function ownedLease(
  previewId: unknown,
  context: Pick<DevPreviewContext, 'binding' | 'supervisor'>,
) {
  if (!context.supervisor) {
    return { code: 'previews_unavailable', message: 'Cats Code previews are not available on this host.' };
  }
  const lease = typeof previewId === 'string' ? context.supervisor.getLease(previewId) : null;
  if (!lease || lease.surface.kind !== 'code_conversation' || lease.surface.surfaceId !== context.binding.channelId) {
    return { code: 'preview_not_found', message: 'No preview with that id belongs to this conversation.' };
  }
  return lease;
}

/** The last `lines` log lines, without terminal color codes. */
export function readLogTail(supervisor: LivePreviewSupervisor, previewId: string, lines: number): string {
  // eslint-disable-next-line no-control-regex
  const logs = (supervisor.readLogs(previewId) ?? '').replace(/\u001b\[[0-9;]*[A-Za-z]/gu, '');
  return logs.split(/\r?\n/u).filter((line, index, all) => line || index < all.length - 1).slice(-lines).join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(error: ShowFailure, logTail?: string): McpToolCallResult {
  return mcpTextResult(logTail === undefined ? { error } : { error, logTail }, true);
}
