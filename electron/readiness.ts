import type {
  DesktopBackgroundState,
  DesktopBootstrapSnapshot,
  DesktopBootstrapProgress,
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
import { DESKTOP_HOST_NAME, DESKTOP_HOST_VERSION } from './contracts.js';
import type { DesktopHealthStatus } from './contracts.js';
import type { DesktopHostConfig } from './config.js';
import { createDesktopBackgroundState } from './hostState.js';
import { createDesktopPackagingPlan } from './packaging.js';
import { describeSetupPack, isOptionalCapabilityPackSetupAction } from './setupBridge.js';
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

function resolveAppEntryPath(setupCompleteAt: string | null | undefined): string {
  return setupCompleteAt ? '/new' : '/setup';
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
        ? 'Setup is complete, but there is no ready provider path for chat yet.'
        : 'Continue into setup to choose an API baseline or optional local CLI provider path.',
      target: 'providers',
      category: 'provider',
      resumeKey: 'provider_setup',
      remediation: {
        kind: 'open_setup',
        label: 'Open setup',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/setup-guide.md',
      },
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
      remediation: {
        kind: 'open_setup',
        label: 'Open setup',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/setup-guide.md',
      },
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
      remediation: {
        kind: 'open_setup',
        label: 'Open setup',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/setup-guide.md',
      },
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
  lastError: string | null | undefined,
): DesktopBootstrapProgress {
  const runtimeService = services.find((service) => service.name === 'cats-runtime');
  const appService = services.find((service) => service.name === 'cats');
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
      label: 'Start cats product server',
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
            ? 'completed'
            : phase === 'failed'
              ? 'failed'
              : setupReady
                ? 'completed'
                : 'pending',
      detail: phase === 'needs_prerequisites'
        ? 'Setup remains available for provider remediation.'
        : null,
      blocking: false,
    },
    {
      id: 'enter-chat',
      label: 'Enter ready chat flow',
      status: phase === 'ready_for_chat'
        ? 'completed'
        : phase === 'failed' || phase === 'needs_prerequisites'
          ? 'failed'
          : 'pending',
      detail: phase === 'needs_prerequisites'
        ? 'A provider path still needs remediation before chat can open.'
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

function buildActions(
  phase: DesktopBootstrapSnapshot['phase'],
  options: {
    appReady: boolean;
    runtimeReady: boolean;
    setup: DesktopSetupState | null | undefined;
  },
): DesktopHostAction[] {
  const actions: DesktopHostAction[] = [];
  const push = (id: DesktopHostActionId, label: string, primary = false) => {
    actions.push({ id, label, primary });
  };
  const lastSetupAction = options.setup?.lastAction ?? null;
  const optionalSetupPackLabel = lastSetupAction && isOptionalCapabilityPackSetupAction(lastSetupAction)
    ? describeSetupPack(lastSetupAction.optionalFollowThroughPack)
    : null;
  const optionalSetupPackActionLabel = optionalSetupPackLabel
    ? `Open Setup for ${optionalSetupPackLabel.replace(/\b\w/g, (value) => value.toUpperCase())}`
    : 'Open Setup';
  const canResumeSetup = Boolean(
    lastSetupAction
    && !isOptionalCapabilityPackSetupAction(lastSetupAction)
    && lastSetupAction.resumable
    && (
      lastSetupAction.interruptions.length > 0
      || lastSetupAction.runState === 'failed'
      || lastSetupAction.manualSteps.length > 0
      || lastSetupAction.restartRequired
      || lastSetupAction.status === 'changes_required'
      || lastSetupAction.status === 'not_installed'
      || lastSetupAction.status === 'auth_required'
    ),
  );

  if (phase === 'ready_for_setup') {
    if (canResumeSetup) {
      push('resume_setup', 'Resume Packaged Setup', true);
      push('open_setup', 'Open Setup');
    } else {
      push('open_setup', 'Continue to Setup', true);
    }
    if (options.runtimeReady) {
      push('open_runtime_diagnostics', 'Open Runtime Diagnostics');
    }
    push('quit', 'Quit');
    return actions;
  }

  if (phase === 'ready_for_chat') {
    push('open_chat', 'Open Cats', true);
    if (optionalSetupPackLabel) {
      push('open_setup', optionalSetupPackActionLabel);
    }
    if (options.runtimeReady) {
      push('open_runtime_diagnostics', 'Open Runtime Diagnostics');
    }
    push('quit', 'Quit');
    return actions;
  }

  if (phase === 'needs_prerequisites' || phase === 'failed') {
    if (canResumeSetup) {
      push('resume_setup', 'Resume Packaged Setup', true);
      push('retry', phase === 'failed' ? 'Retry Startup' : 'Retry Scan');
    } else {
      push('retry', phase === 'failed' ? 'Retry Startup' : 'Retry Scan', true);
    }
    if (options.runtimeReady) {
      push('open_runtime_diagnostics', 'Open Runtime Diagnostics');
    }
    if (options.appReady) {
      push('open_setup', 'Open Setup');
    }
    push('quit', 'Quit');
    return actions;
  }

  push('quit', 'Quit');
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
      const payload = await response.json() as T;
      if (payload.readiness?.ready) {
        return payload;
      }
      lastDetail = payload.summary
        || payload.readiness?.phase
        || `received HTTP ${response.status}`;
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
  const appService = input.services.find((service) => service.name === 'cats');
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
  } else if (
    !hasRuntimeHealth
    || !hasAppHealth
    || !hasAppShell
    || (requiresProviderDiagnostics && !input.providerDiagnostics)
  ) {
    phase = 'checking_prerequisites';
    status = 'degraded';
    summary = 'Local services are ready. Running prerequisite checks.';
  } else if (!setupCompleted) {
    phase = 'ready_for_setup';
    status = 'degraded';
    summary = hasReadyProviderPath(providerSummary)
      ? 'Desktop services are ready. Continue into setup.'
      : 'Desktop services are ready. Continue into setup to choose a provider path.';
  } else if (!input.providerDiagnostics || hasReadyProviderPath(providerSummary)) {
    phase = 'ready_for_chat';
    status = normalizeHealthStatus(input.runtimeHealth?.status)
      ?? normalizeHealthStatus(input.runtimeHealth?.runtime?.status)
      ?? 'ok';
    summary = input.providerDiagnostics
      ? 'Desktop services and at least one provider path are ready.'
      : 'Desktop services are ready. Opening Cats Chat without a startup provider reprobe.';
  } else {
    phase = 'needs_prerequisites';
    status = 'unavailable';
    summary = providerSummary?.summary || 'Cats needs provider remediation before chat can open.';
  }

  const background = input.background ?? createDesktopBackgroundState(input.config);
  const updates = input.updates ?? createDefaultDesktopUpdateState(input.config.update);
  const packaging = input.packaging ?? createDesktopPackagingPlan(input.config, {
    generatedAt: now,
    outputRoot: input.config.paths.packagingOutputRoot,
  });
  const setup = input.setup ?? {
    lastAction: null,
    updatedAt: null,
  };
  const progress = buildBootstrapProgress(input.services, phase, issues, input.lastError);

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
      runtimeReady: Boolean(runtimeService?.ready),
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
  };
}
