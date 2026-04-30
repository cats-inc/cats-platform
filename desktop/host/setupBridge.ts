import { execFile as execFileCallback } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import type { DesktopHostConfig } from './config.js';
import type {
  DesktopPackagingPlan,
  DesktopProviderSetupPlatform,
  DesktopProviderSetupPackId,
  DesktopSetupActionRecord,
  DesktopSetupHelperMode,
  DesktopSetupHelperSummary,
  DesktopSetupInterruption,
  DesktopSetupInterruptionKind,
  DesktopSetupResumeAction,
  DesktopSetupSnapshot,
  DesktopSetupState,
} from './contracts.js';
import { DESKTOP_SETUP_ASSETS } from './setupAssets.js';

interface ExecFileResult {
  stdout: string;
  stderr: string;
}

interface DesktopSetupBridgeDependencies {
  execFile?: (
    file: string,
    args: string[],
    options: {
      windowsHide?: boolean;
    },
  ) => Promise<ExecFileResult>;
  now?: () => Date;
  pathExists?: (path: string) => Promise<boolean>;
  platform?: NodeJS.Platform;
}

interface RunDesktopSetupHelperInput {
  helperId: string;
  mode: DesktopSetupHelperMode;
  extraArguments?: string[];
  dryRun?: boolean;
}

interface ExecFileLikeError {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

const execFile = promisify(execFileCallback);
const INTERRUPTION_PRIORITY: DesktopSetupInterruptionKind[] = [
  'restart_required',
  'relaunch_required',
  'elevation_required',
  'first_wsl_boot_required',
  'docker_warm_up_required',
  'auth_required',
];

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function isDesktopSetupInterruptionKind(value: unknown): value is DesktopSetupInterruptionKind {
  return value === 'restart_required'
    || value === 'relaunch_required'
    || value === 'elevation_required'
    || value === 'auth_required'
    || value === 'first_wsl_boot_required'
    || value === 'docker_warm_up_required';
}

function choosePrimaryInterruption(
  interruptions: DesktopSetupInterruption[],
): DesktopSetupInterruption | null {
  if (interruptions.length === 0) {
    return null;
  }

  const ordered = [...interruptions].sort((left, right) => {
    return INTERRUPTION_PRIORITY.indexOf(left.kind) - INTERRUPTION_PRIORITY.indexOf(right.kind);
  });
  return ordered[0] ?? null;
}

function createDefaultSetupState(): DesktopSetupState {
  return {
    lastAction: null,
    updatedAt: null,
  };
}

export function isSetupAuditHelperId(helperId: string | null | undefined): boolean {
  if (!helperId) {
    return false;
  }

  const asset = findAsset(helperId);
  return asset?.kind === 'readiness_helper';
}

export function shouldAutoRunSetupAudit(
  state: DesktopSetupState | null | undefined,
  options: {
    setupCompleteAt?: string | null;
    productSetupCompleted?: boolean;
  } = {},
): boolean {
  if (options.setupCompleteAt || options.productSetupCompleted) {
    return false;
  }

  const lastAction = state?.lastAction ?? null;
  if (!lastAction) {
    return true;
  }
  if (isSetupAuditHelperId(lastAction.helperId)) {
    return false;
  }
  return lastAction.status === 'ready';
}

export function isOptionalCapabilityPackSetupAction(
  action: Pick<
    DesktopSetupActionRecord,
    'helperId' | 'plannedActions' | 'optionalFollowThroughPack'
  > | null | undefined,
): boolean {
  if (!action) {
    return false;
  }

  if (action.optionalFollowThroughPack !== undefined) {
    return action.optionalFollowThroughPack === 'local_model_pack';
  }

  if (!isSetupAuditHelperId(action.helperId)) {
    return false;
  }

  const plannedActions = Array.isArray(action.plannedActions) ? action.plannedActions : [];
  if (plannedActions.length === 0) {
    return false;
  }

  return plannedActions.every((entry) => entry.startsWith('local_model:'));
}

export function describeSetupPack(
  pack: DesktopProviderSetupPackId | null | undefined,
): string | null {
  switch (pack) {
    case 'api_baseline':
      return 'API baseline';
    case 'native_cli_pack':
      return 'native CLI pack';
    case 'local_model_pack':
      return 'local model pack';
    case 'wsl_power_user_pack':
      return 'WSL power-user pack';
    default:
      return null;
  }
}

function supportsPlatform(
  platform: NodeJS.Platform,
  helperPlatform: DesktopProviderSetupPlatform,
): boolean {
  switch (helperPlatform) {
    case 'cross_platform':
      return platform === 'win32' || platform === 'darwin' || platform === 'linux';
    case 'windows':
    case 'windows_wsl':
      return platform === 'win32';
    case 'macos':
      return platform === 'darwin';
    case 'linux':
      return platform === 'linux';
  }
}

function describePlatformSupport(helperPlatform: DesktopProviderSetupPlatform): string {
  switch (helperPlatform) {
    case 'cross_platform':
      return 'Windows, macOS, or Linux hosts';
    case 'windows':
      return 'Windows hosts';
    case 'windows_wsl':
      return 'Windows hosts with WSL support';
    case 'macos':
      return 'macOS hosts';
    case 'linux':
      return 'Linux hosts';
  }
}

function modeFlag(mode: DesktopSetupHelperMode): string {
  switch (mode) {
    case 'check':
      return '-CheckOnly';
    case 'apply':
      return '-Apply';
    case 'upgrade':
      return '-Upgrade';
    case 'force':
      return '-Force';
    case 'uninstall':
      return '-Uninstall';
  }
}

function supportsMode(helper: DesktopSetupHelperSummary, mode: DesktopSetupHelperMode): boolean {
  switch (mode) {
    case 'check':
      return helper.supportsCheckOnly;
    case 'apply':
      return helper.supportsApply;
    case 'upgrade':
      return helper.supportsUpgrade;
    case 'force':
      return helper.supportsForce;
    case 'uninstall':
      return helper.supportsUninstall;
  }
}

// Planned-action signals emitted by the readiness audit that should hand the
// resume slot to a different helper than the audit itself. The audit is
// supportsApply=false, so without this routing the bootstrap "Continue setup"
// button just re-runs the audit forever instead of installing what the audit
// said to install.
const PLANNED_ACTION_HELPER_SUFFIXES: Record<string, string> = {
  install_node_lts: '-node-host-installer',
  install_node_lts_via_nvm: '-node-host-installer',
  install_github_cli: '-github-cli-installer',
};

function findHelperByPlannedAction(
  helpers: DesktopSetupHelperSummary[],
  auditHelperId: string,
  plannedAction: string,
): DesktopSetupHelperSummary | null {
  const suffix = PLANNED_ACTION_HELPER_SUFFIXES[plannedAction];
  if (!suffix) {
    return null;
  }
  // The audit helper id is `<platform>-install-readiness-audit`; reuse the
  // platform prefix so we always pick the helper that ships on the current
  // host's setup-asset bundle.
  const platformPrefix = auditHelperId.replace(/-install-readiness-audit$/u, '');
  const targetId = `${platformPrefix}${suffix}`;
  const target = helpers.find((candidate) => candidate.id === targetId);
  if (!target || !target.supported || !target.available) {
    return null;
  }
  return target;
}

function deriveResumeAction(
  helpers: DesktopSetupHelperSummary[],
  state: DesktopSetupState,
): DesktopSetupResumeAction | null {
  const lastAction = state.lastAction;
  if (!lastAction || !lastAction.resumable) {
    return null;
  }
  if (isOptionalCapabilityPackSetupAction(lastAction)) {
    return null;
  }
  if (lastAction.mode === 'uninstall') {
    return null;
  }

  // If the audit emitted a host-installer planned action (install_node_lts,
  // install_github_cli, ...), route the resume slot to the host installer's
  // apply mode rather than re-running the audit's check mode.
  if (lastAction.helperId.endsWith('-install-readiness-audit')) {
    for (const planned of lastAction.plannedActions) {
      const target = findHelperByPlannedAction(helpers, lastAction.helperId, planned);
      if (!target) {
        continue;
      }
      const targetMode: DesktopSetupHelperMode | null = target.supportsApply
        ? 'apply'
        : target.supportsCheckOnly
          ? 'check'
          : null;
      if (!targetMode) {
        continue;
      }
      return {
        helperId: target.id,
        label: target.label,
        mode: targetMode,
        reason: 'changes_required',
        summary: `Run ${target.label} to install the missing host substrate flagged by the readiness audit.`,
        manualSteps: lastAction.manualSteps,
        interruptions: lastAction.interruptions,
        requiresElevation: target.requiresElevation
          || lastAction.interruptions.some((entry) => entry.requiresElevation),
        restartRequired: lastAction.restartRequired
          || lastAction.interruptions.some((entry) => entry.requiresRestart),
      };
    }
  }

  const helper = helpers.find((candidate) => candidate.id === lastAction.helperId);
  if (!helper || !helper.supported || !helper.available) {
    return null;
  }

  let reason: DesktopSetupResumeAction['reason'] | null = null;
  let mode: DesktopSetupHelperMode | null = null;
  let summary: string | null = null;
  const primaryInterruption = choosePrimaryInterruption(lastAction.interruptions);

  if (primaryInterruption) {
    reason = primaryInterruption.kind;
    summary = primaryInterruption.summary;
    if (primaryInterruption.kind === 'elevation_required') {
      mode = supportsMode(helper, lastAction.mode)
        ? lastAction.mode
        : helper.supportsApply
          ? 'apply'
          : helper.supportsCheckOnly
            ? 'check'
            : null;
    } else {
      mode = helper.supportsCheckOnly
        ? 'check'
        : supportsMode(helper, lastAction.mode)
          ? lastAction.mode
          : helper.supportsApply
            ? 'apply'
            : null;
    }
  } else if (lastAction.restartRequired || lastAction.status === 'restart_required') {
    reason = 'restart_required';
    mode = helper.supportsCheckOnly ? 'check' : supportsMode(helper, lastAction.mode) ? lastAction.mode : null;
    summary = `Restart the host or Windows session, then rerun ${helper.label} in ${mode ?? 'check'} mode.`;
  } else if (lastAction.status === 'auth_required') {
    reason = 'auth_required';
    mode = helper.supportsCheckOnly ? 'check' : supportsMode(helper, lastAction.mode) ? lastAction.mode : null;
    summary = `Complete the required sign-in flow, then rerun ${helper.label} in ${mode ?? 'check'} mode.`;
  } else if (lastAction.runState === 'failed') {
    reason = 'retry_failed';
    mode = supportsMode(helper, lastAction.mode)
      ? lastAction.mode
      : helper.supportsCheckOnly
        ? 'check'
        : helper.supportsApply
          ? 'apply'
          : null;
    summary = `Retry ${helper.label} after addressing the last failure.`;
  } else if (lastAction.status === 'not_installed') {
    reason = 'not_installed';
    mode = helper.supportsApply ? 'apply' : helper.supportsCheckOnly ? 'check' : null;
    summary = `Run ${helper.label} to install the missing packaged setup requirement.`;
  } else if (lastAction.status === 'changes_required' && lastAction.manualSteps.length > 0) {
    reason = 'manual_follow_up';
    mode = helper.supportsCheckOnly
      ? 'check'
      : supportsMode(helper, lastAction.mode)
        ? lastAction.mode
        : helper.supportsApply
          ? 'apply'
          : null;
    summary = `Finish the manual follow-through for ${helper.label}, then rerun a verification step.`;
  } else if (lastAction.status === 'changes_required') {
    reason = 'changes_required';
    mode = helper.supportsApply
      ? 'apply'
      : helper.supportsUpgrade
        ? 'upgrade'
        : helper.supportsCheckOnly
          ? 'check'
          : null;
    summary = `Run ${helper.label} again to apply the remaining packaged setup changes.`;
  } else if (lastAction.manualSteps.length > 0) {
    reason = 'manual_follow_up';
    mode = helper.supportsCheckOnly ? 'check' : supportsMode(helper, lastAction.mode) ? lastAction.mode : null;
    summary = `Finish the manual follow-through for ${helper.label}, then rerun a verification step.`;
  } else if (lastAction.status === 'ready') {
    reason = 'verification_recommended';
    mode = helper.supportsCheckOnly ? 'check' : null;
    summary = `Rerun ${helper.label} in check mode if you want to verify the packaged setup state again.`;
  }

  if (!reason || !mode || !summary) {
    return null;
  }

  return {
    helperId: helper.id,
    label: helper.label,
    mode,
    reason,
    summary,
    manualSteps: lastAction.manualSteps,
    interruptions: lastAction.interruptions,
    requiresElevation: lastAction.interruptions.some((entry) => entry.requiresElevation)
      || helper.requiresElevation,
    restartRequired: lastAction.restartRequired
      || lastAction.interruptions.some((entry) => entry.requiresRestart),
  };
}

function buildSummary(
  label: string,
  mode: DesktopSetupHelperMode,
  runState: DesktopSetupActionRecord['runState'],
  status: string | null,
): string {
  const normalizedStatus = status ?? (runState === 'completed' ? 'completed' : 'failed');
  return `${label} ${mode} finished with ${normalizedStatus}.`;
}

function toExecFileResult(error: unknown): ExecFileResult {
  const execError = error as ExecFileLikeError | undefined;
  return {
    stdout: typeof execError?.stdout === 'string'
      ? execError.stdout
      : Buffer.isBuffer(execError?.stdout)
        ? execError.stdout.toString('utf8')
        : '',
    stderr: typeof execError?.stderr === 'string'
      ? execError.stderr
      : Buffer.isBuffer(execError?.stderr)
        ? execError.stderr.toString('utf8')
        : '',
  };
}

function parseHelperJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function findAsset(helperId: string) {
  return DESKTOP_SETUP_ASSETS.find((asset) => asset.helperId === helperId) ?? null;
}

async function resolveHelperScriptPath(
  config: DesktopHostConfig,
  helperId: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  const asset = findAsset(helperId);
  if (!asset) {
    return null;
  }

  const candidates = [
    resolve(join(config.packageRoot, asset.sourceRelativePath)),
    resolve(join(config.paths.packagingOutputRoot, asset.stageRelativePath)),
    resolve(join(dirname(config.packageRoot), asset.packagedRelativePath)),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildFailedActionRecord(input: {
  helper: DesktopSetupHelperSummary;
  mode: DesktopSetupHelperMode;
  startedAt: string;
  completedAt: string;
  scriptPath: string | null;
  error: string;
  warnings?: string[];
}): DesktopSetupActionRecord {
  return {
    helperId: input.helper.id,
    assetId: input.helper.assetId,
    label: input.helper.label,
    pack: input.helper.pack,
    mode: input.mode,
    runState: 'failed',
    status: 'failed',
    summary: buildSummary(input.helper.label, input.mode, 'failed', 'failed'),
    packagedRelativePath: input.helper.packagedRelativePath,
    scriptPath: input.scriptPath,
    requiresElevation: input.helper.requiresElevation,
    resumable: input.helper.resumable,
    restartRequired: false,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    warnings: input.warnings ?? [],
    plannedActions: [],
    appliedChanges: [],
    optionalFollowThroughPack: null,
    manualSteps: [],
    interruptions: [],
    error: input.error,
  };
}

function deriveOptionalFollowThroughPack(
  helper: Pick<DesktopSetupHelperSummary, 'id'>,
  plannedActions: string[],
): DesktopProviderSetupPackId | null {
  if (!isSetupAuditHelperId(helper.id) || plannedActions.length === 0) {
    return null;
  }

  if (plannedActions.every((entry) => entry.startsWith('local_model:'))) {
    return 'local_model_pack';
  }

  return null;
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\');
}

function buildHelperExecution(
  helper: Pick<DesktopSetupHelperSummary, 'platform'>,
  scriptPath: string,
  mode: DesktopSetupHelperMode,
  extraArguments: string[] | undefined,
  dryRun: boolean | undefined,
): {
  command: string;
  args: string[];
  windowsHide: boolean;
} {
  const args = [modeFlag(mode), '-Json'];
  if (dryRun) {
    args.push('-DryRun');
  }
  if (Array.isArray(extraArguments)) {
    for (const entry of extraArguments) {
      if (typeof entry === 'string' && entry.length > 0) {
        args.push(entry);
      }
    }
  }

  if (helper.platform === 'windows' || helper.platform === 'windows_wsl') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        ...args,
      ],
      windowsHide: true,
    };
  }

  const normalizedScriptPath = isWindowsAbsolutePath(scriptPath)
    ? scriptPath.replaceAll('\\', '/')
    : scriptPath;
  return {
    command: 'bash',
    args: [
      normalizedScriptPath,
      ...args,
    ],
    windowsHide: false,
  };
}

function buildInterruptionSummary(
  helper: DesktopSetupHelperSummary,
  kind: DesktopSetupInterruptionKind,
  manualSteps: string[],
): string {
  const manualDetail = manualSteps[0];
  if (manualDetail) {
    return manualDetail;
  }

  switch (kind) {
    case 'restart_required':
      return `Restart Windows or the current session, then rerun ${helper.label}.`;
    case 'relaunch_required':
      return `Relaunch Cats Desktop Host, then rerun ${helper.label} to verify the updated packaged setup state.`;
    case 'elevation_required':
      return `${helper.label} requires an elevated host step before it can continue.`;
    case 'auth_required':
      return `Complete the required sign-in flow, then rerun ${helper.label} in check mode.`;
    case 'first_wsl_boot_required':
      return 'Launch the target WSL distro once to finish first-user setup, then rerun the packaged setup check.';
    case 'docker_warm_up_required':
      return 'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.';
  }
}

function deriveLegacyInterruptions(
  helper: DesktopSetupHelperSummary,
  parsed: Record<string, unknown> | null,
  manualSteps: string[],
): DesktopSetupInterruption[] {
  const candidates: DesktopSetupInterruptionKind[] = [];
  const status = readString(parsed?.status);

  if (isDesktopSetupInterruptionKind(status)) {
    candidates.push(status);
  }
  if (parsed?.restartRequired === true) {
    candidates.push('relaunch_required');
  }

  const seen = new Set<string>();
  return candidates.flatMap((kind) => {
    if (seen.has(kind)) {
      return [];
    }
    seen.add(kind);
    return [{
      kind,
      summary: buildInterruptionSummary(helper, kind, manualSteps),
      resumable: helper.resumable,
      requiresRestart: kind === 'restart_required',
      requiresElevation: kind === 'elevation_required' || helper.requiresElevation,
    }];
  });
}

function readInterruptions(
  helper: DesktopSetupHelperSummary,
  parsed: Record<string, unknown> | null,
  manualSteps: string[],
): DesktopSetupInterruption[] {
  const rawInterruptions = Array.isArray(parsed?.interruptions) ? parsed.interruptions : [];
  const parsedInterruptions = rawInterruptions.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const kind = (entry as { kind?: unknown }).kind;
    if (!isDesktopSetupInterruptionKind(kind)) {
      return [];
    }

    return [{
      kind,
      summary: readString((entry as { summary?: unknown }).summary)
        ?? buildInterruptionSummary(helper, kind, manualSteps),
      resumable: (entry as { resumable?: unknown }).resumable !== false && helper.resumable,
      requiresRestart: (entry as { requiresRestart?: unknown }).requiresRestart === true
        || kind === 'restart_required',
      requiresElevation: (entry as { requiresElevation?: unknown }).requiresElevation === true
        || kind === 'elevation_required',
    }];
  });

  return parsedInterruptions.length > 0
    ? parsedInterruptions
    : deriveLegacyInterruptions(helper, parsed, manualSteps);
}

export function createEmptyDesktopSetupState(): DesktopSetupState {
  return createDefaultSetupState();
}

export async function buildDesktopSetupSnapshot(
  input: {
    config: DesktopHostConfig;
    packaging: DesktopPackagingPlan;
    state?: DesktopSetupState | null;
  },
  dependencies: DesktopSetupBridgeDependencies = {},
): Promise<DesktopSetupSnapshot> {
  const platform = dependencies.platform ?? process.platform;
  const pathExists = dependencies.pathExists ?? defaultPathExists;
  const state = input.state ?? createDefaultSetupState();
  const helpers = await Promise.all(
    input.packaging.installer.providerSetup.helperCatalog.map(async (helper) => {
      const scriptPath = await resolveHelperScriptPath(input.config, helper.id, pathExists);
      const supported = supportsPlatform(platform, helper.platform);
      return {
        ...helper,
        available: scriptPath !== null,
        supported,
        unsupportedReason: !supported
          ? `${helper.label} is currently only supported on ${describePlatformSupport(helper.platform)}.`
          : scriptPath
            ? null
            : `${helper.label} is not currently bundled with this host build.`,
      } satisfies DesktopSetupHelperSummary;
    }),
  );

  return {
    helpers,
    state,
    resumeAction: deriveResumeAction(helpers, state),
  };
}

export async function runDesktopSetupHelper(
  input: {
    config: DesktopHostConfig;
    packaging: DesktopPackagingPlan;
    action: RunDesktopSetupHelperInput;
  },
  dependencies: DesktopSetupBridgeDependencies = {},
): Promise<DesktopSetupActionRecord> {
  const now = dependencies.now ?? (() => new Date());
  const platform = dependencies.platform ?? process.platform;
  const pathExists = dependencies.pathExists ?? defaultPathExists;
  const execRunner = dependencies.execFile ?? (async (file, args, options) => {
    const result = await execFile(file, args, {
      windowsHide: options.windowsHide,
      encoding: 'utf8',
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  });

  const snapshot = await buildDesktopSetupSnapshot({
    config: input.config,
    packaging: input.packaging,
  }, {
    pathExists,
    platform,
  });
  const helper = snapshot.helpers.find((candidate) => candidate.id === input.action.helperId);
  if (!helper) {
    throw new Error(`Unknown packaged setup helper: ${input.action.helperId}`);
  }

  const startedAt = now().toISOString();
  const scriptPath = await resolveHelperScriptPath(input.config, helper.id, pathExists);
  if (!helper.supported) {
    return buildFailedActionRecord({
      helper,
      mode: input.action.mode,
      startedAt,
      completedAt: now().toISOString(),
      scriptPath,
      error: helper.unsupportedReason ?? `${helper.label} is not supported on this host.`,
    });
  }
  if (!scriptPath) {
    return buildFailedActionRecord({
      helper,
      mode: input.action.mode,
      startedAt,
      completedAt: now().toISOString(),
      scriptPath: null,
      error: `${helper.label} is missing from the current packaged host build.`,
    });
  }
  if (!supportsMode(helper, input.action.mode)) {
    return buildFailedActionRecord({
      helper,
      mode: input.action.mode,
      startedAt,
      completedAt: now().toISOString(),
      scriptPath,
      error: `${helper.label} does not support ${input.action.mode} mode.`,
    });
  }
  const execution = buildHelperExecution(
    helper,
    scriptPath,
    input.action.mode,
    input.action.extraArguments,
    input.action.dryRun,
  );

  let output: ExecFileResult;
  let runState: DesktopSetupActionRecord['runState'] = 'completed';
  let errorMessage: string | null = null;

  try {
    output = await execRunner(execution.command, execution.args, {
      windowsHide: execution.windowsHide,
    });
  } catch (error) {
    output = toExecFileResult(error);
    runState = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const parsed = parseHelperJson(output.stdout);
  const status = readString(parsed?.status) ?? (runState === 'completed' ? 'completed' : 'failed');
  const warnings = readStringArray(parsed?.warnings);
  const plannedActions = readStringArray(parsed?.plannedActions);
  const appliedChanges = readStringArray(parsed?.appliedChanges);
  const manualSteps = readStringArray(parsed?.manualSteps);
  const interruptions = readInterruptions(helper, parsed, manualSteps);
  const stderrMessage = readString(output.stderr);
  const completedAt = now().toISOString();

  if (!parsed && runState === 'failed') {
    return buildFailedActionRecord({
      helper,
      mode: input.action.mode,
      startedAt,
      completedAt,
      scriptPath,
      error: stderrMessage ?? errorMessage ?? `${helper.label} failed before emitting structured output.`,
    });
  }

  return {
    helperId: helper.id,
    assetId: helper.assetId,
    label: helper.label,
    pack: helper.pack,
    mode: input.action.mode,
    runState,
    status,
    summary: buildSummary(helper.label, input.action.mode, runState, status),
    packagedRelativePath: helper.packagedRelativePath,
    scriptPath,
    requiresElevation: helper.requiresElevation,
    resumable: helper.resumable,
    restartRequired: parsed?.restartRequired === true,
    startedAt,
    completedAt,
    warnings,
    plannedActions,
    appliedChanges,
    optionalFollowThroughPack: deriveOptionalFollowThroughPack(helper, plannedActions),
    manualSteps,
    interruptions,
    error: errorMessage ?? stderrMessage,
  };
}
