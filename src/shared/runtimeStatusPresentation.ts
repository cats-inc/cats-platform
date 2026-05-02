/**
 * Shared runtime status presentation model.
 *
 * Centralises status resolution, tooltip copy, and CSS class mapping
 * so Lobby, product sidebars, and any future consumer stay consistent.
 */

import type { RuntimeSetupStatus } from './runtimeSetup.js';
import {
  PLATFORM_RUNTIME_ROOT_PATH,
  PLATFORM_RUNTIME_SETUP_PATH,
} from './runtimeIngressPaths.js';
import type { MessageKey } from './i18n/messageKeys.js';

export type RuntimePresentationStatus = 'ready' | 'degraded' | 'unavailable' | 'unknown';
export type RuntimeTooltipTranslator = (key: MessageKey) => string;

export interface RuntimePresentationInput {
  reachable?: boolean;
  status?: string | null;
}

const READY_STATUSES = new Set(['ok', 'healthy', 'ready']);
const DEGRADED_STATUSES = new Set(['degraded', 'warming', 'starting']);
const UNAVAILABLE_STATUSES = new Set(['error', 'unavailable', 'failed']);

export function resolveRuntimePresentationStatus(
  runtime: RuntimePresentationInput | null | undefined,
): RuntimePresentationStatus {
  if (!runtime || typeof runtime.reachable !== 'boolean') {
    return 'unknown';
  }
  if (!runtime.reachable) {
    return 'unavailable';
  }

  const raw = typeof runtime.status === 'string' ? runtime.status.toLowerCase() : '';
  if (READY_STATUSES.has(raw)) return 'ready';
  if (DEGRADED_STATUSES.has(raw)) return 'degraded';
  if (UNAVAILABLE_STATUSES.has(raw)) return 'unavailable';

  return runtime.reachable ? 'ready' : 'unknown';
}

export function resolveRuntimeTooltipKey(
  status: RuntimePresentationStatus,
): MessageKey {
  switch (status) {
    case 'ready': return 'sharedRuntimeStatusTooltipReady';
    case 'degraded': return 'sharedRuntimeStatusTooltipDegraded';
    case 'unavailable': return 'sharedRuntimeStatusTooltipUnavailable';
    default: return 'sharedRuntimeStatusTooltipUnknown';
  }
}

const DEFAULT_RUNTIME_TOOLTIP_COPY: Record<RuntimePresentationStatus, string> = {
  ready: 'Cats Runtime is connected',
  degraded: 'Cats Runtime is starting up',
  unavailable: 'Cats Runtime is offline',
  unknown: 'Checking Cats Runtime status\u2026',
};

export function resolveRuntimeTooltip(
  status: RuntimePresentationStatus,
  t?: RuntimeTooltipTranslator,
): string {
  return t ? t(resolveRuntimeTooltipKey(status)) : DEFAULT_RUNTIME_TOOLTIP_COPY[status];
}

// -- Sidebar runtime-status dot (product sidebars) --

export function resolveRuntimeDotClassName(
  status: RuntimePresentationStatus,
): string {
  switch (status) {
    case 'ready': return 'runtimeStatusDot isConnected';
    case 'degraded': return 'runtimeStatusDot isDegraded';
    case 'unavailable': return 'runtimeStatusDot isUnavailable';
    default: return 'runtimeStatusDot isUnknown';
  }
}

// -- Recovery entry routing --

export type RuntimeRecoveryTarget = 'desktop-setup' | 'runtime-setup' | 'runtime-root';

export function needsRuntimeSetupRecovery(
  runtimeSetupStatus?: RuntimeSetupStatus | null,
): boolean {
  return runtimeSetupStatus === 'ready_to_apply'
    || runtimeSetupStatus === 'scan_required'
    || runtimeSetupStatus === 'attention_required'
    || runtimeSetupStatus === 'unavailable';
}

export function resolveRuntimeRecoveryTarget(
  status: RuntimePresentationStatus,
  options?: {
    desktopSetupRelevant?: boolean;
    runtimeSetupStatus?: RuntimeSetupStatus | null;
  },
): RuntimeRecoveryTarget {
  if (options?.desktopSetupRelevant) {
    return 'desktop-setup';
  }
  if (needsRuntimeSetupRecovery(options?.runtimeSetupStatus)) {
    return 'runtime-setup';
  }
  if (status === 'unavailable' || status === 'degraded') {
    return 'runtime-setup';
  }
  return 'runtime-root';
}

export function resolveRuntimeRecoveryUrl(
  target: RuntimeRecoveryTarget,
): string {
  if (target === 'desktop-setup') {
    throw new Error('Desktop setup targets must be handled before resolving a runtime URL.');
  }
  if (target === 'runtime-setup') {
    return PLATFORM_RUNTIME_SETUP_PATH;
  }
  return PLATFORM_RUNTIME_ROOT_PATH;
}

// -- Lobby identity dot (PlatformLobby) --

export function resolveRuntimeLobbyDotClassName(
  status: RuntimePresentationStatus,
): string {
  switch (status) {
    case 'ready': return 'lobbyIdentityDot lobbyIdentityDot--ok';
    case 'unavailable':
    case 'degraded': return 'lobbyIdentityDot lobbyIdentityDot--warn';
    default: return 'lobbyIdentityDot lobbyIdentityDot--warn';
  }
}
