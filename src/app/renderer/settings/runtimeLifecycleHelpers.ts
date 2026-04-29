import {
  resolveDesktopHostBridge,
  type DesktopSetupSnapshot,
  type RuntimeLifecycleHelperMode,
  type RuntimeLifecycleHelperSummary,
  type RuntimeLifecycleLastAction,
} from '../../../shared/desktopRecoveryBridge.js';
import { triggerProviderCatalogRefresh } from '../../../products/shared/renderer/api/providerCatalogRefreshStore.js';

export type RuntimeLifecycleAction =
  | 'check'
  | 'install'
  | 'upgrade'
  | 'repair'
  | 'uninstall';

export const ACTION_TO_MODE: Record<RuntimeLifecycleAction, RuntimeLifecycleHelperMode> = {
  check: 'check',
  install: 'apply',
  upgrade: 'upgrade',
  repair: 'force',
  uninstall: 'uninstall',
};

export interface RuntimeLifecycleActionAvailability {
  action: RuntimeLifecycleAction;
  label: string;
  available: boolean;
  reason: string | null;
}

export function helperSupportsAction(
  helper: RuntimeLifecycleHelperSummary,
  action: RuntimeLifecycleAction,
): boolean {
  switch (action) {
    case 'check':
      return helper.supportsCheckOnly;
    case 'install':
      return helper.supportsApply;
    case 'upgrade':
      return helper.supportsUpgrade;
    case 'repair':
      return helper.supportsForce;
    case 'uninstall':
      return helper.supportsUninstall;
  }
}

export function deriveHelperActions(
  helper: RuntimeLifecycleHelperSummary,
): RuntimeLifecycleActionAvailability[] {
  const actions: RuntimeLifecycleAction[] = ['check', 'install', 'upgrade', 'repair', 'uninstall'];
  return actions.map((action) => ({
    action,
    label: actionLabel(action),
    available: helper.supported && helper.available && helperSupportsAction(helper, action),
    reason: !helper.supported
      ? helper.unsupportedReason
      : !helper.available
        ? `${helper.label} is not currently bundled with this host build.`
        : !helperSupportsAction(helper, action)
          ? `${helper.label} does not support ${action} mode.`
          : null,
  }));
}

export function actionLabel(action: RuntimeLifecycleAction): string {
  switch (action) {
    case 'check':
      return 'Check';
    case 'install':
      return 'Install';
    case 'upgrade':
      return 'Upgrade';
    case 'repair':
      return 'Repair';
    case 'uninstall':
      return 'Uninstall';
  }
}

export type LifecycleOutcomeKind = 'success' | 'partial' | 'failure';

export interface RuntimeLifecycleOutcome {
  kind: LifecycleOutcomeKind;
  helperId: string;
  action: RuntimeLifecycleAction;
  status: string | null;
  summary: string;
  plannedActions: string[];
  appliedChanges: string[];
  warnings: string[];
  manualSteps: string[];
  message: string;
}

const SUCCESS_STATUSES_BY_ACTION: Record<RuntimeLifecycleAction, ReadonlySet<string>> = {
  check: new Set(['ready', 'not_installed', 'changes_required', 'auth_required']),
  install: new Set(['ready']),
  upgrade: new Set(['ready']),
  repair: new Set(['ready']),
  uninstall: new Set(['uninstalled', 'not_installed']),
};

const PARTIAL_STATUSES_BY_ACTION: Record<RuntimeLifecycleAction, ReadonlySet<string>> = {
  check: new Set(['failed']),
  install: new Set(['changes_required', 'auth_required', 'restart_required', 'not_installed']),
  upgrade: new Set(['changes_required', 'auth_required', 'restart_required']),
  repair: new Set(['changes_required', 'auth_required', 'restart_required']),
  uninstall: new Set(['changes_required', 'blocked', 'preview']),
};

function classifyLastActionForAction(
  lastAction: RuntimeLifecycleLastAction,
  action: RuntimeLifecycleAction,
): LifecycleOutcomeKind {
  if (lastAction.runState === 'failed') {
    return 'failure';
  }
  const status = lastAction.status ?? '';
  if (status === 'failed') {
    return 'failure';
  }
  const partial = PARTIAL_STATUSES_BY_ACTION[action];
  if (partial.has(status)) {
    return action === 'check' ? 'failure' : 'partial';
  }
  const success = SUCCESS_STATUSES_BY_ACTION[action];
  if (success.has(status)) {
    return 'success';
  }
  return 'partial';
}

function buildOutcome(
  helper: RuntimeLifecycleHelperSummary,
  action: RuntimeLifecycleAction,
  snapshot: DesktopSetupSnapshot | undefined,
): RuntimeLifecycleOutcome {
  const lastAction = snapshot?.state?.lastAction ?? null;
  const expectedMode = ACTION_TO_MODE[action];
  if (
    !lastAction
    || lastAction.helperId !== helper.id
    || lastAction.mode !== expectedMode
  ) {
    return {
      kind: 'failure',
      helperId: helper.id,
      action,
      status: null,
      summary: '',
      plannedActions: [],
      appliedChanges: [],
      warnings: [],
      manualSteps: [],
      message: `${helper.label}: host did not report a result for ${action}.`,
    };
  }

  const kind = classifyLastActionForAction(lastAction, action);
  const status = lastAction.status;
  const message = (() => {
    if (kind === 'success') {
      return `${helper.label}: ${actionLabel(action).toLowerCase()} ${
        status === 'not_installed' && action === 'uninstall' ? 'reported nothing to remove' : 'complete'
      }.`;
    }
    if (kind === 'partial') {
      const head = `${helper.label}: ${actionLabel(action).toLowerCase()} ${status ?? 'changes_required'}`;
      const detail = lastAction.warnings[0] ?? lastAction.manualSteps[0];
      return detail ? `${head} — ${detail}` : `${head}.`;
    }
    const detail = lastAction.summary || lastAction.warnings[0] || status;
    return detail
      ? `${helper.label}: ${actionLabel(action).toLowerCase()} failed — ${detail}.`
      : `${helper.label}: ${actionLabel(action).toLowerCase()} failed.`;
  })();

  return {
    kind,
    helperId: helper.id,
    action,
    status,
    summary: lastAction.summary ?? '',
    plannedActions: lastAction.plannedActions ?? [],
    appliedChanges: lastAction.appliedChanges ?? [],
    warnings: lastAction.warnings ?? [],
    manualSteps: lastAction.manualSteps ?? [],
    message,
  };
}

async function invokeHelper(
  helperId: string,
  mode: RuntimeLifecycleHelperMode,
  extraArguments?: string[],
): Promise<DesktopSetupSnapshot | undefined> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.runSetupHelper) {
    return undefined;
  }
  return await bridge.runSetupHelper(helperId, mode, extraArguments);
}

export async function runRuntimeLifecycleAction(
  helper: RuntimeLifecycleHelperSummary,
  action: RuntimeLifecycleAction,
): Promise<RuntimeLifecycleOutcome> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.runSetupHelper) {
    return {
      kind: 'failure',
      helperId: helper.id,
      action,
      status: null,
      summary: '',
      plannedActions: [],
      appliedChanges: [],
      warnings: [],
      manualSteps: [],
      message: 'Desktop host bridge is not available in this client.',
    };
  }

  try {
    const snapshot = await invokeHelper(helper.id, ACTION_TO_MODE[action]);
    const outcome = buildOutcome(helper, action, snapshot);
    if (outcome.kind === 'success' || outcome.kind === 'partial') {
      void triggerProviderCatalogRefresh().catch(() => undefined);
    }
    return outcome;
  } catch (error) {
    return {
      kind: 'failure',
      helperId: helper.id,
      action,
      status: null,
      summary: '',
      plannedActions: [],
      appliedChanges: [],
      warnings: [],
      manualSteps: [],
      message: error instanceof Error ? error.message : `${helper.label}: ${action} failed.`,
    };
  }
}

export interface RuntimeUninstallPreview {
  helperId: string;
  status: string | null;
  plannedActions: string[];
  warnings: string[];
  manualSteps: string[];
  systemInstallPath: string | null;
  available: boolean;
  message: string | null;
}

export async function previewRuntimeLifecycleUninstall(
  helper: RuntimeLifecycleHelperSummary,
): Promise<RuntimeUninstallPreview> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.runSetupHelper) {
    return {
      helperId: helper.id,
      status: null,
      plannedActions: [],
      warnings: [],
      manualSteps: [],
      systemInstallPath: null,
      available: false,
      message: 'Desktop host bridge is not available.',
    };
  }

  try {
    const snapshot = await invokeHelper(helper.id, 'uninstall', ['--dry-run']);
    const lastAction = snapshot?.state?.lastAction ?? null;
    if (!lastAction || lastAction.helperId !== helper.id || lastAction.mode !== 'uninstall') {
      return {
        helperId: helper.id,
        status: null,
        plannedActions: [],
        warnings: [],
        manualSteps: [],
        systemInstallPath: null,
        available: false,
        message: 'Host did not return a preview result.',
      };
    }
    const systemInstallWarning = (lastAction.warnings ?? []).find((entry) =>
      entry.startsWith('system_install_remains_at:'),
    );
    return {
      helperId: helper.id,
      status: lastAction.status,
      plannedActions: lastAction.plannedActions ?? [],
      warnings: lastAction.warnings ?? [],
      manualSteps: lastAction.manualSteps ?? [],
      systemInstallPath: systemInstallWarning
        ? systemInstallWarning.slice('system_install_remains_at:'.length)
        : null,
      available: true,
      message: null,
    };
  } catch (error) {
    return {
      helperId: helper.id,
      status: null,
      plannedActions: [],
      warnings: [],
      manualSteps: [],
      systemInstallPath: null,
      available: false,
      message: error instanceof Error ? error.message : 'Preview failed.',
    };
  }
}

export async function fetchRuntimeLifecycleHelpers(): Promise<RuntimeLifecycleHelperSummary[]> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.getSetupSnapshot) {
    return [];
  }
  try {
    const snapshot = await bridge.getSetupSnapshot();
    return Array.isArray(snapshot.helpers) ? snapshot.helpers : [];
  } catch {
    return [];
  }
}

export function selectUninstallableHelpers(
  helpers: RuntimeLifecycleHelperSummary[],
): RuntimeLifecycleHelperSummary[] {
  return helpers.filter(
    (helper) => helper.supported && helper.available && helper.supportsUninstall,
  );
}

export function selectLifecycleHelpers(
  helpers: RuntimeLifecycleHelperSummary[],
): RuntimeLifecycleHelperSummary[] {
  return helpers.filter((helper) => {
    if (!helper.supported || !helper.available) {
      return false;
    }
    return (
      helper.supportsApply
      || helper.supportsUpgrade
      || helper.supportsForce
      || helper.supportsUninstall
    );
  });
}

export function describeHelperPath(helper: RuntimeLifecycleHelperSummary): string {
  return helper.packagedRelativePath;
}
