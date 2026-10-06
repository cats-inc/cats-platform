import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

import type { CatsCoreState } from '../../../core/types.js';
import { mcpTextResult, type McpToolCallResult, type McpToolDefinition } from '../../../platform/mcp/jsonRpcServer.js';
import type { CanvasSurfaceRef } from '../../shared/artifactCanvas/contracts.js';
import type { ArtifactCanvasPolicyConfig } from '../../shared/artifactCanvas/iframePolicy.js';
import type { ArtifactCanvasRenderIntentHub } from '../../shared/artifactCanvas/renderIntent.js';
import { prepareLivePreviewArtifactCanvasShow } from '../livePreview/artifactMaterialization.js';
import { VITE_LIVE_PREVIEW_PROFILE } from '../livePreview/contracts.js';
import type { LivePreviewSupervisor } from '../livePreview/supervisor.js';
import type { CodeAgentToolGrantBinding } from './contracts.js';
import { resolveWorkspacePath, type ShowFailure } from './showInCanvas.js';
import { confirmCanvasPresentation } from './canvasConfirmation.js';

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
    'Pass directory (the folder that has package.json); script defaults to "dev". Vite runs directly; other dev',
    'scripts (Next.js, Astro, Nuxt, webpack, Parcel, or any server that reads PORT) run through npm.',
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
  const detected = await detectDevServerProfile(target.path, script, target.workspaceRoot);
  if ('code' in detected) return failure(detected);

  const surface: CanvasSurfaceRef = { kind: 'code_conversation', surfaceId: context.binding.channelId };
  const current = context.devLeases.get(surface.surfaceId);
  if (current) {
    await supervisor.stop(current, 'replaced');
    context.devLeases.delete(surface.surfaceId);
  }
  const started = await supervisor.start({
    commandProfileId: detected.profileId,
    // The direct Vite profile runs vite itself; npm-script profiles run the script.
    ...(detected.profileId === VITE_LIVE_PREVIEW_PROFILE.id ? {} : { script }),
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

  let shown!: ReturnType<typeof prepareLivePreviewArtifactCanvasShow>;
  await context.updateCore((core) => {
    shown = prepareLivePreviewArtifactCanvasShow(core, lease, {
      entryPath: '/',
      title: title || basename(target.path),
      presentationRequested: 'auto',
      actorId: context.binding.actorId,
      policyConfig: context.policyConfig,
      supervisorPreviewLeaseStore: supervisor,
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
  return confirmCanvasPresentation(shown.intent, {
    previewId: lease.previewId,
    artifactId: shown.artifact.id,
    canvasPath: shown.intent.targetUrl,
    previewUrl: `${lease.origin}/`,
    profileId: lease.commandProfileId,
  }, context.hub);
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
 * CAP-07 profile choice (PLAN-116 D3). The script must exist in
 * `package.json`, and a project with dependencies must have installed them
 * (`node_modules` in the directory or a parent inside the workspace).
 * - `vite`, `vite dev` or `vite serve`, with Vite installed in the directory
 *   itself, runs Vite directly with the reviewed `vite` profile.
 * - Any other script runs through npm (`npm-script` profiles). The last command
 *   of the script decides the framework adapter that passes the leased port on
 *   the command line; others read `PORT` from the environment.
 */
export async function detectDevServerProfile(
  directory: string,
  script: string,
  workspaceRoot: string = directory,
): Promise<{ profileId: string } | ShowFailure> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { code: 'package_json_missing', message: 'The directory has no package.json.' }
      : { code: 'package_json_invalid', message: 'package.json is not valid JSON.' };
  }
  const record = isRecord(manifest) ? manifest : {};
  const scripts = isRecord(record.scripts) ? record.scripts : {};
  const command = scripts[script];
  if (typeof command !== 'string') {
    const names = Object.keys(scripts);
    return {
      code: 'script_missing',
      message: `package.json has no "${script}" script (scripts: ${names.length ? names.join(', ') : 'none'}).`,
    };
  }
  const parsed = parseScriptCommand(command);
  if (parsed.tool === 'vite' && parsed.subcommand === 'build') {
    return {
      code: 'profile_unsupported',
      message: `The "${script}" script runs \`${command}\`, which builds files without starting a server. `
        + 'Pass the dev script, or open the built index.html with show_in_canvas.',
    };
  }
  const dependencies = [record.dependencies, record.devDependencies]
    .flatMap((entry) => (isRecord(entry) ? Object.keys(entry) : []));
  if (dependencies.length > 0 && !await hasNodeModules(directory, workspaceRoot)) {
    return {
      code: 'dependencies_missing',
      message: 'Dependencies are not installed. Run npm install in that folder, then call start_dev_preview again.',
    };
  }
  if (parsed.simple && isViteDevCommand(command) && await exists(join(directory, 'node_modules', 'vite', 'bin', 'vite.js'))) {
    return { profileId: VITE_LIVE_PREVIEW_PROFILE.id };
  }
  return { profileId: (parsed.tool && NPM_SCRIPT_ADAPTERS[parsed.tool]) || 'npm-script' };
}

/** The framework tools whose dev servers take the port on the command line. */
const NPM_SCRIPT_ADAPTERS: Record<string, string> = {
  vite: 'npm-script:vite',
  astro: 'npm-script:astro',
  next: 'npm-script:next',
  nuxt: 'npm-script:nuxt',
  nuxi: 'npm-script:nuxt',
  'webpack-dev-server': 'npm-script:webpack',
  webpack: 'npm-script:webpack',
  parcel: 'npm-script:parcel',
};

/**
 * The tool and subcommand of a script's last command; npm appends extra
 * arguments to the end of the script, so the last command receives the port.
 */
export function parseScriptCommand(command: string): { tool: string | null; subcommand: string | null; simple: boolean } {
  const segments = command.split(/&&|\|\||;/u);
  const tokens = segments[segments.length - 1]!.trim().split(/\s+/u).filter(Boolean);
  let index = 0;
  if (tokens[index] === 'cross-env' || tokens[index] === 'env') index += 1;
  while (tokens[index]?.includes('=')) index += 1;
  const tool = tokens[index] ?? null;
  const next = tokens[index + 1];
  return {
    tool,
    subcommand: next && !next.startsWith('-') ? next : null,
    simple: segments.length === 1 && index === 0,
  };
}

/** `vite`, `vite dev` or `vite serve`, with any flags; the profile sets host and port. */
export function isViteDevCommand(command: string): boolean {
  const parsed = parseScriptCommand(command);
  return parsed.simple && parsed.tool === 'vite'
    && (parsed.subcommand === null || parsed.subcommand === 'dev' || parsed.subcommand === 'serve');
}

async function hasNodeModules(directory: string, workspaceRoot: string): Promise<boolean> {
  let current = directory;
  for (;;) {
    if (await exists(join(current, 'node_modules'))) return true;
    const parent = dirname(current);
    if (parent === current || !isInside(workspaceRoot, parent)) return false;
    current = parent;
  }
}

function isInside(root: string, candidate: string): boolean {
  const inside = relative(root, candidate);
  return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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
