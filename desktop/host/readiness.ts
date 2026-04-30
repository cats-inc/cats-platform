import type {
  DesktopBackgroundState,
  DesktopBootstrapPrerequisites,
  DesktopBootstrapSnapshot,
  DesktopBootstrapProgress,
  DesktopCliInventory,
  DesktopHostAction,
  DesktopPackagingPlan,
  DesktopHostActionId,
  DesktopPrerequisiteIssue,
  DesktopProviderIssue,
  DesktopProviderSummary,
  DesktopSetupState,
  DesktopUpdateState,
  ManagedServiceSnapshot,
} from './contracts.js';
import { DESKTOP_HOST_NAME } from './contracts.js';
import { DESKTOP_HOST_VERSION } from './hostVersion.js';
import type { DesktopHealthStatus } from './contracts.js';
import type { DesktopHostConfig } from './config.js';
import { createDesktopBackgroundState } from './hostState.js';
import { createDesktopPackagingPlan } from './packaging.js';
import {
  buildDesktopCliInventory,
  describeSetupPack,
  isOptionalCapabilityPackSetupAction,
} from './setupBridge.js';
import { createDefaultDesktopUpdateState } from './update.js';

export interface ReadinessPayload {
  readiness?: {
    ready?: boolean;
    phase?: string;
  };
  status?: string;
  summary?: string;
}

export interface AppHealthPayload extends ReadinessPayload {
  runtime?: {
    reachable?: boolean;
  };
}

export interface AppShellPayload {
  bootstrapAttemptId?: string | null;
  setupCompleteAt?: string | null;
  products?: Array<{
    id?: string;
    productName?: string;
    routePrefix?: string;
    installState?: string;
    setup?: {
      selectable?: boolean;
      disabledReason?: string;
    } | null;
  }>;
}

export interface RuntimeDiagnosticsHealthPayload {
  status?: string;
  summary?: string;
  readiness?: {
    ready?: boolean;
    phase?: string;
    bootstrapRequired?: boolean;
  };
  runtime?: {
    status?: string;
    summary?: string;
  };
  providers?: {
    summary?: DesktopProviderSummary;
  };
}

export interface RuntimeProviderDiagnosticsPayload {
  summary?: DesktopProviderSummary;
  providers?: Array<{
    provider?: string;
    backend?: string;
    instance?: string;
    target?: string;
    defaultTarget?: boolean;
    availability?: {
      status?: string;
      summary?: string;
      attentionCodes?: string[];
    };
  }>;
}

interface BuildDesktopBootstrapSnapshotInput {
  config: DesktopHostConfig;
  services: ManagedServiceSnapshot[];
  appHealth?: AppHealthPayload | null;
  appShell?: AppShellPayload | null;
  runtimeHealth?: RuntimeDiagnosticsHealthPayload | null;
  providerDiagnostics?: RuntimeProviderDiagnosticsPayload | null;
  persistedSetupCompleteAt?: string | null;
  persistedProductSetupCompleted?: boolean;
  lastError?: string | null;
  now?: () => Date;
  background?: DesktopBackgroundState;
  updates?: DesktopUpdateState;
  packaging?: DesktopPackagingPlan;
  setup?: DesktopSetupState;
  hostStatePath?: string | null;
  platform?: NodeJS.Platform;
}

interface WaitForServiceReadinessOptions {
  timeoutMs: number;
  pollIntervalMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeHealthStatus(value: string | undefined): DesktopHealthStatus | null {
  if (value === 'ok' || value === 'degraded' || value === 'unavailable') {
    return value;
  }
  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readReadinessPayloadDetail(payload: unknown, fallback: string): string {
  if (!isObjectRecord(payload)) {
    return fallback;
  }

  const summary = readNonEmptyString(payload.summary);
  if (summary) {
    return summary;
  }

  const readiness = isObjectRecord(payload.readiness) ? payload.readiness : null;
  const phase = readNonEmptyString(readiness?.phase);
  if (phase) {
    return phase;
  }

  return readNonEmptyString(payload.status) ?? fallback;
}

function isStrictlyReadyPayload(payload: unknown): boolean {
  if (!isObjectRecord(payload) || !isObjectRecord(payload.readiness)) {
    return false;
  }

  return payload.readiness.ready === true;
}

function resolveAppEntryPath(setupCompleteAt: string | null | undefined): string {
  return setupCompleteAt ? '/' : '/setup';
}

function hasReadyProviderPath(summary: DesktopProviderSummary | null): boolean {
  return (summary?.ok ?? 0) > 0;
}

function toProviderIssues(
  payload: RuntimeProviderDiagnosticsPayload | null | undefined,
): DesktopProviderIssue[] {
  const candidates = Array.isArray(payload?.providers) ? payload.providers : [];
  return candidates
    .filter((candidate) => {
      const status = normalizeHealthStatus(candidate.availability?.status);
      return status !== null && status !== 'ok';
    })
    .map((candidate) => ({
      provider: candidate.provider || 'unknown',
      backend: candidate.backend || 'unknown',
      instance: candidate.instance || 'default',
      target: candidate.target || 'unknown',
      defaultTarget: candidate.defaultTarget === true,
      status: normalizeHealthStatus(candidate.availability?.status) || 'degraded',
      summary: candidate.availability?.summary || 'Provider target needs attention.',
      attentionCodes: Array.isArray(candidate.availability?.attentionCodes)
        ? candidate.availability?.attentionCodes.filter((code): code is string => Boolean(code))
        : [],
    }));
}

function buildIssues(
  appHealth: AppHealthPayload | null | undefined,
  appShell: AppShellPayload | null | undefined,
  runtimeHealth: RuntimeDiagnosticsHealthPayload | null | undefined,
  providerSummary: DesktopProviderSummary | null,
  providerIssues: DesktopProviderIssue[],
  setup: DesktopSetupState | null | undefined,
  lastError: string | null | undefined,
): DesktopPrerequisiteIssue[] {
  const issues: DesktopPrerequisiteIssue[] = [];
  const setupComplete = Boolean(appShell?.setupCompleteAt);
  const lastSetupAction = setup?.lastAction ?? null;
  const providerRecoveryRemediation = setupComplete
    ? {
        kind: 'open_runtime_diagnostics' as const,
        label: 'Open runtime diagnostics',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/deployment.md',
      }
    : {
        kind: 'open_setup' as const,
        label: 'Open setup',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/setup-guide.md',
      };

  if (lastError) {
    issues.push({
      id: 'host-startup-error',
      severity: 'error',
      title: 'Desktop host failed to finish startup',
      detail: lastError,
      category: 'service',
      resumeKey: 'host_startup_retry',
      remediation: {
        kind: 'retry',
        label: 'Retry desktop host startup',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/deployment.md',
      },
    });
  }

  if (appHealth?.runtime?.reachable === false) {
    issues.push({
      id: 'cats-runtime-unreachable',
      severity: 'error',
      title: 'Cats cannot reach cats-runtime',
      detail: 'The local app booted, but its runtime dependency is still unreachable.',
      target: 'cats-runtime',
      category: 'service',
      resumeKey: 'runtime_diagnostics',
      remediation: {
        kind: 'open_runtime_diagnostics',
        label: 'Open runtime diagnostics',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/deployment.md',
      },
    });
  }

  if ((providerSummary?.targets ?? 0) === 0) {
    issues.push({
      id: 'no-provider-targets',
      severity: setupComplete ? 'error' : 'info',
      title: 'No provider targets are configured yet',
      detail: setupComplete
        ? 'Setup is complete. Open Cats to recover in-app after you restore a provider path.'
        : 'Continue into setup to choose an API baseline or optional local CLI provider path.',
      target: 'providers',
      category: 'provider',
      resumeKey: 'provider_setup',
      remediation: providerRecoveryRemediation,
    });
  } else if (!hasReadyProviderPath(providerSummary)) {
    issues.push({
      id: 'no-ready-provider-path',
      severity: setupComplete ? 'error' : 'warning',
      title: 'No provider target is currently ready',
      detail: providerSummary?.summary || 'Provider diagnostics need attention.',
      target: 'providers',
      category: 'provider',
      resumeKey: 'provider_remediation',
      remediation: providerRecoveryRemediation,
    });
  }

  for (const providerIssue of providerIssues.filter((issue) => issue.defaultTarget)) {
    issues.push({
      id: `provider-${providerIssue.provider}-${providerIssue.instance}`,
      severity: providerIssue.status === 'unavailable' ? 'error' : 'warning',
      title: `${providerIssue.provider}/${providerIssue.instance} needs attention`,
      detail: providerIssue.summary,
      target: providerIssue.target,
      category: 'provider',
      resumeKey: `provider_${providerIssue.provider}_${providerIssue.instance}`,
      remediation: providerRecoveryRemediation,
    });
  }

  if (lastSetupAction) {
    const optionalCapabilityPackFollowThrough = isOptionalCapabilityPackSetupAction(lastSetupAction);
    if (optionalCapabilityPackFollowThrough) {
      const optionalPackLabel = describeSetupPack(lastSetupAction.optionalFollowThroughPack)
        ?? 'optional capability pack';
      issues.push({
        id: 'setup-optional-capability-pack',
        severity: 'info',
        title: `Optional ${optionalPackLabel} is available for follow-through`,
        detail: lastSetupAction.manualSteps[0] ?? lastSetupAction.summary,
        target: lastSetupAction.helperId,
        category: 'install',
        resumeKey: `setup_${lastSetupAction.helperId}_optional`,
        remediation: null,
      });
    }
    if (!optionalCapabilityPackFollowThrough) {
      const interruptions = Array.isArray(lastSetupAction.interruptions)
        ? lastSetupAction.interruptions
        : [];
      for (const interruption of interruptions) {
        let title = 'Packaged setup still needs follow-through';
        let severity: DesktopPrerequisiteIssue['severity'] = setupComplete ? 'error' : 'warning';
        let issueId = `setup-${interruption.kind}`;

        switch (interruption.kind) {
          case 'restart_required':
            title = 'Packaged setup needs a Windows restart before it can continue';
            issueId = 'setup-restart-required';
            break;
          case 'relaunch_required':
            title = 'Packaged setup needs the desktop host to relaunch';
            issueId = 'setup-relaunch-required';
            break;
          case 'elevation_required':
            title = 'Packaged setup needs elevation before it can continue';
            issueId = 'setup-elevation-required';
            break;
          case 'auth_required':
            title = 'Installed provider still needs authentication';
            issueId = 'setup-auth-required';
            severity = setupComplete ? 'error' : 'warning';
            break;
          case 'first_wsl_boot_required':
            title = 'WSL distro needs its first boot before setup can continue';
            issueId = 'setup-first-wsl-boot-required';
            break;
          case 'docker_warm_up_required':
            title = 'Docker still needs to finish starting before setup can continue';
            issueId = 'setup-docker-warm-up-required';
            break;
        }

        issues.push({
          id: issueId,
          severity,
          title,
          detail: interruption.summary,
          target: lastSetupAction.helperId,
          category: 'install',
          resumeKey: `setup_${lastSetupAction.helperId}_${interruption.kind}`,
          remediation: {
            kind: 'resume_setup',
            label: 'Resume packaged setup',
            resumable: lastSetupAction.resumable && interruption.resumable,
            requiresRestart: interruption.requiresRestart,
            docsPath: 'cats-platform/docs/setup-guide.md',
          },
        });
      }
    }
  }

  if (
    lastSetupAction
    && !isOptionalCapabilityPackSetupAction(lastSetupAction)
    && lastSetupAction.runState === 'failed'
    && (lastSetupAction.interruptions?.length ?? 0) === 0
  ) {
    issues.push({
      id: 'setup-recovery-required',
      severity: setupComplete ? 'error' : 'warning',
      title: 'Packaged setup helper needs recovery',
      detail: lastSetupAction.error ?? lastSetupAction.summary,
      target: lastSetupAction.helperId,
      category: 'install',
      resumeKey: `setup_${lastSetupAction.helperId}_retry`,
      remediation: {
        kind: 'resume_setup',
        label: 'Resume packaged setup',
        resumable: lastSetupAction.resumable,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/setup-guide.md',
      },
    });
  } else if (
    lastSetupAction
    && !isOptionalCapabilityPackSetupAction(lastSetupAction)
    && lastSetupAction.manualSteps.length > 0
    && lastSetupAction.interruptions.length === 0
  ) {
    issues.push({
      id: 'setup-manual-follow-through',
      severity: 'info',
      title: 'Packaged setup still has manual follow-through',
      detail: lastSetupAction.manualSteps[0] ?? lastSetupAction.summary,
      target: lastSetupAction.helperId,
      category: 'install',
      resumeKey: `setup_${lastSetupAction.helperId}_manual`,
      remediation: {
        kind: 'resume_setup',
        label: 'Resume packaged setup',
        resumable: lastSetupAction.resumable,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/setup-guide.md',
      },
    });
  }

  if (!runtimeHealth && !lastError) {
    issues.push({
      id: 'runtime-diagnostics-pending',
      severity: 'info',
      title: 'Runtime diagnostics are still loading',
      detail: 'The desktop host has not finished its prerequisite scan yet.',
      target: 'cats-runtime',
      category: 'service',
      remediation: null,
    });
  }

  return issues;
}

function buildBootstrapProgress(
  services: ManagedServiceSnapshot[],
  phase: DesktopBootstrapSnapshot['phase'],
  issues: DesktopPrerequisiteIssue[],
  setupCompleted: boolean,
  lastError: string | null | undefined,
): DesktopBootstrapProgress {
  const runtimeService = services.find((service) => service.name === 'cats-runtime');
  const appService = services.find((service) => service.name === 'cats-platform');
  const runtimeReady = runtimeService?.ready === true;
  const appReady = appService?.ready === true;
  const setupReady = phase === 'ready_for_setup' || phase === 'ready_for_chat' || phase === 'needs_prerequisites';

  const steps: DesktopBootstrapProgress['steps'] = [
    {
      id: 'start-runtime',
      label: 'Start cats-runtime sidecar',
      status: runtimeService?.status === 'failed'
        ? 'failed'
        : runtimeReady
          ? 'completed'
          : 'running',
      detail: runtimeService?.error ?? null,
      blocking: true,
    },
    {
      id: 'start-app',
      label: 'Start cats-platform server',
      status: appService?.status === 'failed'
        ? 'failed'
        : appReady
          ? 'completed'
          : runtimeReady
            ? 'running'
            : 'pending',
      detail: appService?.error ?? null,
      blocking: true,
    },
    {
      id: 'scan-prerequisites',
      label: 'Scan provider and prerequisite readiness',
      status: phase === 'starting_services'
        ? 'pending'
        : phase === 'checking_prerequisites'
          ? 'running'
          : lastError
            ? 'failed'
            : 'completed',
      detail: issues.length > 0 ? `${issues.length} issue(s) currently reported.` : null,
      blocking: true,
    },
    {
      id: 'enter-setup',
      label: 'Prepare first-run setup or remediation handoff',
      status: phase === 'ready_for_setup'
        ? 'completed'
        : phase === 'ready_for_chat'
          ? 'skipped'
          : phase === 'needs_prerequisites'
            ? setupCompleted
              ? 'skipped'
              : 'completed'
            : phase === 'failed'
              ? 'failed'
              : setupReady
                ? 'completed'
                : 'pending',
      detail: phase === 'needs_prerequisites'
        ? setupCompleted
          ? 'Setup is already complete; remaining issues should resolve through runtime recovery.'
          : 'Setup remains available for provider remediation.'
        : null,
      blocking: false,
    },
    {
      id: 'enter-chat',
      label: 'Enter ready chat flow',
      status: phase === 'ready_for_chat'
        ? 'completed'
        : phase === 'needs_prerequisites'
          ? setupCompleted
            ? 'completed'
            : 'failed'
          : phase === 'failed'
          ? 'failed'
          : 'pending',
      detail: phase === 'needs_prerequisites'
        ? setupCompleted
          ? 'Cats will open into recovery until a provider path becomes ready again.'
          : 'A provider path still needs remediation before chat can open.'
        : null,
      blocking: false,
    },
  ];

  const currentStep = steps.find((step) => step.status === 'running')
    ?? steps.find((step) => step.status === 'failed')
    ?? steps.find((step) => step.status === 'pending')
    ?? null;

  return {
    currentStepId: currentStep?.id ?? null,
    steps,
  };
}

/**
 * Determine whether the last packaged-setup action left the host in a
 * state that warrants a "Resume Setup" repair action.
 */
function canResumePackagedSetup(
  setup: DesktopSetupState | null | undefined,
): boolean {
  const lastAction = setup?.lastAction ?? null;
  return Boolean(
    lastAction
    && !isOptionalCapabilityPackSetupAction(lastAction)
    && lastAction.resumable
    && (
      lastAction.interruptions.length > 0
      || lastAction.runState === 'failed'
      || lastAction.manualSteps.length > 0
      || lastAction.restartRequired
      || lastAction.status === 'changes_required'
      || lastAction.status === 'not_installed'
      || lastAction.status === 'auth_required'
    ),
  );
}

/**
 * Build a stable three-slot action row for the recovery/details surface.
 *
 * Slots:
 *   [Continue]  – safest forward path (open_setup / open_chat)
 *   [Repair]    – single best repair action (retry / resume_setup)
 *   [Quit Cats] – explicit exit (always present)
 *
 * Rules:
 *   - At most three buttons.
 *   - Retry* and Resume Setup never appear in the same row.
 *   - Open Runtime Diagnostics is NOT in this row (lives in an
 *     expandable detail section instead).
 */
function buildActions(
  phase: DesktopBootstrapSnapshot['phase'],
  options: {
    appReady: boolean;
    setupComplete: boolean;
    setup: DesktopSetupState | null | undefined;
  },
): DesktopHostAction[] {
  const actions: DesktopHostAction[] = [];
  const resumable = canResumePackagedSetup(options.setup);

  function pushAction(
    id: DesktopHostAction['id'],
    label: string,
    primary = false,
  ): void {
    actions.push(primary ? { id, label, primary: true } : { id, label });
  }

  // ── Continue slot ──────────────────────────────────────────────────
  if (phase === 'ready_for_setup') {
    pushAction('open_setup', 'Continue to Setup', true);
  } else if (phase === 'ready_for_chat') {
    pushAction('open_chat', 'Open Cats', true);
  } else if (phase === 'needs_prerequisites' && options.setupComplete) {
    pushAction('open_chat', 'Open Cats', true);
  } else if ((phase === 'failed' || phase === 'needs_prerequisites') && options.appReady) {
    if (options.setupComplete) {
      pushAction('open_chat', 'Open Cats', true);
    } else {
      pushAction('open_setup', 'Open Setup', true);
    }
  }

  // ── Repair slot ────────────────────────────────────────────────────
  if (phase === 'ready_for_setup') {
    pushAction('retry', 'Retry Check');
  } else if (phase === 'needs_prerequisites' && resumable) {
    pushAction('resume_setup', 'Resume Setup');
  } else if (phase === 'failed') {
    pushAction('retry', 'Retry Startup');
  } else if (phase === 'needs_prerequisites') {
    pushAction('retry', 'Retry Check');
  }

  // ── Quit slot ──────────────────────────────────────────────────────
  pushAction('quit', 'Quit Cats');

  return actions;
}

export async function waitForServiceReadiness<T extends ReadinessPayload>(
  url: string,
  options: WaitForServiceReadinessOptions,
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  let lastDetail = 'no response yet';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const httpDetail = `received HTTP ${response.status}`;
        const payloadDetail = readReadinessPayloadDetail(payload, httpDetail);
        lastDetail = payloadDetail === httpDetail
          ? httpDetail
          : `${httpDetail}: ${payloadDetail}`;
        await sleep(options.pollIntervalMs);
        continue;
      }
      if (isStrictlyReadyPayload(payload)) {
        return payload as T;
      }
      lastDetail = readReadinessPayloadDetail(payload, `received HTTP ${response.status}`);
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
    }

    await sleep(options.pollIntervalMs);
  }

  throw new Error(`Timed out waiting for readiness at ${url}: ${lastDetail}`);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return await response.json() as T;
}

export function buildDesktopBootstrapSnapshot(
  input: BuildDesktopBootstrapSnapshotInput,
): DesktopBootstrapSnapshot {
  const now = input.now?.() ?? new Date();
  const runtimeService = input.services.find((service) => service.name === 'cats-runtime');
  const appService = input.services.find((service) => service.name === 'cats-platform');
  const allServicesReady = input.services.every((service) => service.ready);
  const providerSummary = input.providerDiagnostics?.summary ?? input.runtimeHealth?.providers?.summary ?? null;
  const providerIssues = toProviderIssues(input.providerDiagnostics);
  const issues = buildIssues(
    input.appHealth,
    input.appShell,
    input.runtimeHealth,
    providerSummary,
    providerIssues,
    input.setup,
    input.lastError,
  );
  const setupCompleteAt = input.appShell?.setupCompleteAt
    ?? input.persistedSetupCompleteAt
    ?? null;
  const setupCompleted = Boolean(setupCompleteAt || input.persistedProductSetupCompleted);
  const entryPath = resolveAppEntryPath(setupCompleteAt);
  const hasRuntimeHealth = Boolean(input.runtimeHealth);
  const hasAppHealth = Boolean(input.appHealth);
  const hasAppShell = Boolean(input.appShell);
  const requiresProviderDiagnostics = !setupCompleted;
  const packagingForInventory = input.packaging ?? createDesktopPackagingPlan(input.config, {
    generatedAt: now,
    outputRoot: input.config.paths.packagingOutputRoot,
  });
  const setupForInventory = input.setup ?? {
    lastAction: null,
    updatedAt: null,
    installedHelperIds: [],
  };
  const cliInventory: DesktopCliInventory = buildDesktopCliInventory(
    packagingForInventory,
    setupForInventory,
    input.platform ?? process.platform,
  );
  const cliMissing = cliInventory.total === 0;
  let phase: DesktopBootstrapSnapshot['phase'];
  let status: DesktopBootstrapSnapshot['status'];
  let summary: string;

  if (input.lastError) {
    phase = 'failed';
    status = 'unavailable';
    summary = input.lastError;
  } else if (!allServicesReady) {
    phase = 'starting_services';
    status = 'degraded';
    summary = 'Starting local Cats services and waiting for readiness.';
  } else if (!hasAppHealth || !hasAppShell || (requiresProviderDiagnostics && !input.providerDiagnostics)) {
    phase = 'checking_prerequisites';
    status = 'degraded';
    summary = 'Local services are ready. Running prerequisite checks.';
  } else if (cliMissing) {
    phase = 'needs_prerequisites';
    status = 'degraded';
    summary = setupCompleteAt
      ? 'No CLI is currently installed. Install one to continue using Cats.'
      : 'Welcome. Install a CLI to get started with Cats.';
  } else if (!setupCompleted) {
    if (!hasRuntimeHealth) {
      phase = 'checking_prerequisites';
      status = 'degraded';
      summary = 'Local services are ready. Running prerequisite checks.';
    } else {
      phase = 'ready_for_setup';
      status = 'degraded';
      summary = hasReadyProviderPath(providerSummary)
        ? 'Desktop services are ready. Continue into setup.'
        : 'Desktop services are ready. Continue into setup to choose a provider path.';
    }
  } else if (!hasRuntimeHealth) {
    phase = 'needs_prerequisites';
    status = 'unavailable';
    summary = 'Cats Runtime is unavailable. Open Cats to recover in-app once the runtime is back.';
  } else if (!input.providerDiagnostics || hasReadyProviderPath(providerSummary)) {
    phase = 'ready_for_chat';
    status = normalizeHealthStatus(input.runtimeHealth?.status)
      ?? normalizeHealthStatus(input.runtimeHealth?.runtime?.status)
      ?? 'ok';
    summary = input.providerDiagnostics
      ? 'Desktop services and at least one provider path are ready.'
      : 'Desktop services are ready. Opening Cats without a startup provider reprobe.';
  } else {
    phase = 'needs_prerequisites';
    status = 'unavailable';
    summary = providerSummary?.summary
      || 'Cats needs provider recovery, but setup remains complete and Cats can still open.';
  }

  const background = input.background ?? createDesktopBackgroundState(input.config);
  const updates = input.updates ?? createDefaultDesktopUpdateState(input.config.update);
  const packaging = packagingForInventory;
  const setup = setupForInventory;
  const progress = buildBootstrapProgress(
    input.services,
    phase,
    issues,
    setupCompleted,
    input.lastError,
  );

  return {
    service: DESKTOP_HOST_NAME,
    version: DESKTOP_HOST_VERSION,
    timestamp: now.toISOString(),
    phase,
    status,
    summary,
    services: input.services,
    runtime: {
      baseUrl: input.config.runtimeBaseUrl,
      diagnosticsUrl: `${input.config.runtimeBaseUrl}/diagnostics/health`,
      status: normalizeHealthStatus(input.runtimeHealth?.status)
        ?? normalizeHealthStatus(input.runtimeHealth?.runtime?.status),
      summary: input.runtimeHealth?.runtime?.summary ?? null,
      providerSummary,
      issues: providerIssues,
    },
    app: {
      baseUrl: input.config.appBaseUrl,
      setupCompleteAt,
      entryPath,
      status: normalizeHealthStatus(input.appHealth?.status),
      summary: input.appHealth?.summary ?? null,
    },
    issues,
    actions: buildActions(phase, {
      appReady: Boolean(appService?.ready),
      setupComplete: setupCompleted,
      setup,
    }),
    lastError: input.lastError ?? null,
    progress,
    background,
    updates,
    packaging,
    setup,
    diagnostics: null,
    hostStatePath: input.hostStatePath ?? input.config.paths.hostStatePath,
    prerequisites: {
      cliInventory,
    } satisfies DesktopBootstrapPrerequisites,
  };
}
