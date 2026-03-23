import type {
  DesktopBootstrapSnapshot,
  DesktopHostAction,
  DesktopHostActionId,
  DesktopPrerequisiteIssue,
  DesktopProviderIssue,
  DesktopProviderSummary,
  ManagedServiceSnapshot,
} from './contracts.js';
import { DESKTOP_HOST_NAME, DESKTOP_HOST_VERSION } from './contracts.js';
import type { DesktopHealthStatus } from './contracts.js';
import type { DesktopHostConfig } from './config.js';

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
  setupCompleteAt?: string | null;
}

export interface RuntimeDiagnosticsHealthPayload {
  status?: string;
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
  lastError?: string | null;
  now?: () => Date;
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
  lastError: string | null | undefined,
): DesktopPrerequisiteIssue[] {
  const issues: DesktopPrerequisiteIssue[] = [];
  const setupComplete = Boolean(appShell?.setupCompleteAt);

  if (lastError) {
    issues.push({
      id: 'host-startup-error',
      severity: 'error',
      title: 'Desktop host failed to finish startup',
      detail: lastError,
    });
  }

  if (appHealth?.runtime?.reachable === false) {
    issues.push({
      id: 'cats-runtime-unreachable',
      severity: 'error',
      title: 'Cats cannot reach cats-runtime',
      detail: 'The local app booted, but its runtime dependency is still unreachable.',
      target: 'cats-runtime',
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
    });
  } else if (!hasReadyProviderPath(providerSummary)) {
    issues.push({
      id: 'no-ready-provider-path',
      severity: setupComplete ? 'error' : 'warning',
      title: 'No provider target is currently ready',
      detail: providerSummary?.summary || 'Provider diagnostics need attention.',
      target: 'providers',
    });
  }

  for (const providerIssue of providerIssues.filter((issue) => issue.defaultTarget)) {
    issues.push({
      id: `provider-${providerIssue.provider}-${providerIssue.instance}`,
      severity: providerIssue.status === 'unavailable' ? 'error' : 'warning',
      title: `${providerIssue.provider}/${providerIssue.instance} needs attention`,
      detail: providerIssue.summary,
      target: providerIssue.target,
    });
  }

  if (!runtimeHealth && !lastError) {
    issues.push({
      id: 'runtime-diagnostics-pending',
      severity: 'info',
      title: 'Runtime diagnostics are still loading',
      detail: 'The desktop host has not finished its prerequisite scan yet.',
      target: 'cats-runtime',
    });
  }

  return issues;
}

function buildActions(
  phase: DesktopBootstrapSnapshot['phase'],
  options: {
    appReady: boolean;
    runtimeReady: boolean;
  },
): DesktopHostAction[] {
  const actions: DesktopHostAction[] = [];
  const push = (id: DesktopHostActionId, label: string, primary = false) => {
    actions.push({ id, label, primary });
  };

  if (phase === 'ready_for_setup') {
    push('open_setup', 'Continue to Setup', true);
    if (options.runtimeReady) {
      push('open_runtime_diagnostics', 'Open Runtime Diagnostics');
    }
    push('quit', 'Quit');
    return actions;
  }

  if (phase === 'ready_for_chat') {
    push('open_chat', 'Open Cats', true);
    if (options.runtimeReady) {
      push('open_runtime_diagnostics', 'Open Runtime Diagnostics');
    }
    push('quit', 'Quit');
    return actions;
  }

  if (phase === 'needs_prerequisites' || phase === 'failed') {
    push('retry', phase === 'failed' ? 'Retry Startup' : 'Retry Scan', true);
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
    input.lastError,
  );
  const setupCompleteAt = input.appShell?.setupCompleteAt ?? null;
  const entryPath = resolveAppEntryPath(setupCompleteAt);
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
  } else if (!input.runtimeHealth || !input.providerDiagnostics || !input.appHealth || !input.appShell) {
    phase = 'checking_prerequisites';
    status = 'degraded';
    summary = 'Local services are ready. Running prerequisite checks.';
  } else if (!setupCompleteAt) {
    phase = 'ready_for_setup';
    status = 'degraded';
    summary = hasReadyProviderPath(providerSummary)
      ? 'Desktop services are ready. Continue into setup.'
      : 'Desktop services are ready. Continue into setup to choose a provider path.';
  } else if (hasReadyProviderPath(providerSummary)) {
    phase = 'ready_for_chat';
    status = 'ok';
    summary = 'Desktop services and at least one provider path are ready.';
  } else {
    phase = 'needs_prerequisites';
    status = 'unavailable';
    summary = providerSummary?.summary || 'Cats needs provider remediation before chat can open.';
  }

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
    }),
    lastError: input.lastError ?? null,
  };
}
