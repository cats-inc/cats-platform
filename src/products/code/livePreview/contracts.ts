import type { CanvasSurfaceRef } from '../../shared/artifactCanvas/contracts.js';

export const CODE_LIVE_PREVIEW_PRODUCER_TOOL_NAME =
  'cats_code_live_preview_supervisor' as const;
export const CODE_LIVE_PREVIEW_PRODUCER_IDENTITY =
  `tool:${CODE_LIVE_PREVIEW_PRODUCER_TOOL_NAME}` as const;

export const LIVE_PREVIEW_ALLOWED_PLACEHOLDERS = [
  'artifactDirectory',
  'npmCli',
  'port',
  'script',
  'workspaceRoot',
] as const;

export type LivePreviewPlaceholder = (typeof LIVE_PREVIEW_ALLOWED_PLACEHOLDERS)[number];

export const LIVE_PREVIEW_WORKING_DIRECTORIES = [
  'artifactDirectory',
  'workspaceRoot',
] as const;

export type LivePreviewWorkingDirectory =
  (typeof LIVE_PREVIEW_WORKING_DIRECTORIES)[number];

export interface LivePreviewCommandProfile {
  id: string;
  label: string;
  enabled?: boolean;
  executable: string;
  args: string[];
  workingDirectory: LivePreviewWorkingDirectory;
  env?: Record<string, string>;
  port: {
    mode: 'argument' | 'env';
    name: string;
  };
  readiness: {
    path: string;
    timeoutMs: number;
    intervalMs: number;
    expectedStatus?: number;
  };
  stop: {
    graceMs: number;
    killProcessTree: boolean;
  };
}

export interface LivePreviewPortRange {
  start: number;
  end: number;
}

export interface LivePreviewConfig {
  enabled: boolean;
  /**
   * When true AND `enabled` is true, the supervisor uses the real
   * `child_process.spawn` adapter; otherwise it falls back to the fake
   * adapter. Default false. Flipping this requires PLAN-097 Task 5.1
   * security review approval and an isolated test workspace per Task 5.4.
   */
  useRealProcessAdapter?: boolean;
  portRange: LivePreviewPortRange;
  maxConcurrentGlobal: number;
  maxConcurrentPerWorkspace: number;
  defaultLeaseTtlMs: number;
  logMaxBytes: number;
  allowIpv6Loopback: boolean;
  commandProfiles: LivePreviewCommandProfile[];
}

export interface LivePreviewWorkspaceRef {
  kind: 'code_workspace';
  id: string;
  rootPath: string;
}

export interface LivePreviewStartRequest {
  commandProfileId: string;
  workspace: LivePreviewWorkspaceRef;
  /** Absolute directory inside `workspace.rootPath`; defaults to the root. */
  artifactDirectory?: string | null;
  surface: CanvasSurfaceRef;
  artifactTitle?: string | null;
  readinessTimeoutMs?: number | null;
  /** The `package.json` script an npm-script profile runs (`{script}`). */
  script?: string | null;
}

export type LivePreviewStatus =
  | 'expired'
  | 'failed'
  | 'ready'
  | 'starting'
  | 'stopped'
  | 'stopping';

export interface LivePreviewLease {
  previewId: string;
  commandProfileId: string;
  surface: CanvasSurfaceRef;
  workspaceRef: LivePreviewWorkspaceRef;
  /** The directory the lease serves or runs in; recorded so it can be restarted. */
  artifactDirectory?: string | null;
  /** The script an npm-script lease runs; recorded so it can be restarted. */
  script?: string | null;
  origin: string;
  host: '127.0.0.1' | '[::1]';
  port: number;
  processId: number | null;
  status: LivePreviewStatus;
  logPath: string;
  artifactId: string | null;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
}

export type LivePreviewErrorCode =
  | 'live_preview_command_profile_disabled'
  | 'live_preview_command_profile_invalid'
  | 'live_preview_command_profile_not_found'
  | 'live_preview_concurrency_limit_exceeded'
  | 'live_preview_config_invalid'
  | 'live_preview_disabled'
  | 'live_preview_not_found'
  | 'live_preview_npm_unavailable'
  | 'live_preview_port_unavailable'
  | 'live_preview_process_exited'
  | 'live_preview_raw_command_not_allowed'
  | 'live_preview_readiness_timeout'
  | 'live_preview_request_invalid'
  | 'live_preview_spawn_failed'
  | 'live_preview_stop_failed';

export interface LivePreviewError {
  code: LivePreviewErrorCode;
  message: string;
  details?: unknown;
}

export type LivePreviewStartValidationResult =
  | {
      status: 'accepted';
      request: LivePreviewStartRequest;
      profile: LivePreviewCommandProfile;
    }
  | {
      status: 'rejected';
      error: LivePreviewError;
    };

export interface LivePreviewStartAcceptedResult {
  status: 'accepted';
  previewId: string;
  origin: string;
  artifactId: string | null;
}

export interface LivePreviewStopAcceptedResult {
  status: 'accepted';
  previewId: string;
  stopReason: string;
}

export type LivePreviewStartResult =
  | LivePreviewStartAcceptedResult
  /** `previewId` is present once a lease existed, so its logs stay readable. */
  | { status: 'rejected'; error: LivePreviewError; previewId?: string };

export type LivePreviewStopResult =
  | LivePreviewStopAcceptedResult
  | { status: 'rejected'; error: LivePreviewError };

export const DEFAULT_LIVE_PREVIEW_CONFIG: LivePreviewConfig = {
  // SPEC-123 (approved 2026-09-29): previews are on by default. Spawning real
  // processes still needs `useRealProcessAdapter` and an enabled profile.
  enabled: true,
  useRealProcessAdapter: false,
  portRange: { start: 47_100, end: 47_199 },
  maxConcurrentGlobal: 3,
  maxConcurrentPerWorkspace: 1,
  defaultLeaseTtlMs: 30 * 60 * 1000,
  logMaxBytes: 1024 * 1024,
  allowIpv6Loopback: false,
  commandProfiles: [],
};

/**
 * First reviewed real command profile (PLAN-097 Phase 5 Task 5.2).
 *
 * Vite serves the local artifact directory, binds the loopback host that the
 * supervisor leases, and exits cleanly on SIGTERM. The profile is **not**
 * included in `DEFAULT_LIVE_PREVIEW_CONFIG` — operators must opt in by adding
 * it to their `commandProfiles` and flipping the top-level `enabled` flag, and
 * the real process adapter must be wired in (PLAN-097 Task 5.3). Even when
 * registered, `enabled: false` here keeps the profile dormant until an
 * operator explicitly turns it on.
 *
 * The executable is `node` rather than `npx` so the profile is shell-free on
 * Windows. `npx` resolves to a `.cmd` shim that needs `shell: true` to launch,
 * which the supervisor refuses for security. The args invoke Vite's CLI
 * directly via its installed JS entry; the artifact directory must therefore
 * have `vite` installed in `node_modules` (operator responsibility, captured
 * in the operator guide).
 */
export const VITE_LIVE_PREVIEW_PROFILE: LivePreviewCommandProfile = {
  id: 'vite',
  label: 'Vite (artifact directory)',
  enabled: false,
  executable: 'node',
  args: [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '{port}',
    '--strictPort',
  ],
  workingDirectory: 'artifactDirectory',
  port: { mode: 'argument', name: '--port' },
  readiness: {
    path: '/',
    timeoutMs: 30_000,
    intervalMs: 250,
    expectedStatus: 200,
  },
  stop: {
    graceMs: 5_000,
    killProcessTree: true,
  },
};

/**
 * SPEC-123 CAP-07 / PLAN-116 D3: run a `package.json` script through npm's JS
 * entry (`{npmCli}`, found by `findNpmCli`), shell-free. `PORT` and `HOST`
 * come from the environment; each framework adapter below also passes the
 * leased port on the command line where that framework takes it. `{script}`
 * is a script name checked against `package.json`, never a command string.
 */
function npmScriptProfile(
  id: string,
  label: string,
  portArgs: string[],
): LivePreviewCommandProfile {
  return {
    id,
    label,
    enabled: false,
    executable: 'node',
    args: ['{npmCli}', 'run', '{script}', ...(portArgs.length ? ['--', ...portArgs] : [])],
    workingDirectory: 'artifactDirectory',
    env: { HOST: '127.0.0.1', BROWSER: 'none' },
    port: { mode: 'env', name: 'PORT' },
    readiness: { path: '/', timeoutMs: 60_000, intervalMs: 500, expectedStatus: 200 },
    stop: { graceMs: 5_000, killProcessTree: true },
  };
}

export const NPM_SCRIPT_LIVE_PREVIEW_PROFILES: readonly LivePreviewCommandProfile[] = [
  npmScriptProfile('npm-script', 'npm run (PORT from the environment)', []),
  npmScriptProfile('npm-script:vite', 'npm run, Vite-based', ['--host', '127.0.0.1', '--port', '{port}', '--strictPort']),
  npmScriptProfile('npm-script:astro', 'npm run, Astro', ['--host', '127.0.0.1', '--port', '{port}']),
  npmScriptProfile('npm-script:next', 'npm run, Next.js', ['-H', '127.0.0.1', '-p', '{port}']),
  npmScriptProfile('npm-script:nuxt', 'npm run, Nuxt', ['--host', '127.0.0.1', '--port', '{port}']),
  npmScriptProfile('npm-script:webpack', 'npm run, webpack dev server', ['--host', '127.0.0.1', '--port', '{port}']),
  npmScriptProfile('npm-script:parcel', 'npm run, Parcel', ['--host', '127.0.0.1', '--port', '{port}']),
];

export const STATIC_LIVE_PREVIEW_READINESS_PATH = '/.cats-preview-ready';

/**
 * SPEC-123 CAP-05 static profile. It never spawns a process: the supervisor's
 * composite adapter serves the artifact directory from an in-process loopback
 * server. Always registered and enabled; see `withBuiltinLivePreviewProfiles`.
 */
export const STATIC_LIVE_PREVIEW_PROFILE: LivePreviewCommandProfile = {
  id: 'static',
  label: 'Static files (in-process)',
  enabled: true,
  executable: 'cats-static-preview',
  args: [],
  workingDirectory: 'artifactDirectory',
  port: { mode: 'env', name: 'PORT' },
  readiness: {
    path: STATIC_LIVE_PREVIEW_READINESS_PATH,
    timeoutMs: 5_000,
    intervalMs: 50,
    expectedStatus: 204,
  },
  stop: {
    graceMs: 1,
    killProcessTree: false,
  },
};

/** Configured profiles plus the always-available in-process static profile. */
export function withBuiltinLivePreviewProfiles(config: LivePreviewConfig): LivePreviewConfig {
  return config.commandProfiles.some((profile) => profile.id === STATIC_LIVE_PREVIEW_PROFILE.id)
    ? config
    : { ...config, commandProfiles: [STATIC_LIVE_PREVIEW_PROFILE, ...config.commandProfiles] };
}

/**
 * Reviewed-but-disabled built-in profiles operators may opt into. The platform
 * does not auto-register these — adding to `commandProfiles` is an explicit
 * decision per SPEC-108 § Process Supervision.
 */
export const BUILTIN_LIVE_PREVIEW_PROFILES: readonly LivePreviewCommandProfile[] = [
  VITE_LIVE_PREVIEW_PROFILE,
] as const;

/** Whether a lease runs an OS process, as opposed to the in-process static server. */
export function isProcessLivePreviewProfile(commandProfileId: string): boolean {
  return commandProfileId !== STATIC_LIVE_PREVIEW_PROFILE.id;
}
