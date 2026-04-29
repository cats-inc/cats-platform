import {
  resolveDesktopHostBridge,
  type RuntimeLifecycleHelperMode,
  type RuntimeLifecycleHelperSummary,
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

export interface RuntimeLifecycleResult {
  success: boolean;
  helperId: string;
  action: RuntimeLifecycleAction;
  message: string;
}

export async function runRuntimeLifecycleAction(
  helper: RuntimeLifecycleHelperSummary,
  action: RuntimeLifecycleAction,
): Promise<RuntimeLifecycleResult> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.runSetupHelper) {
    return {
      success: false,
      helperId: helper.id,
      action,
      message: 'Desktop host bridge is not available in this client.',
    };
  }

  const mode = ACTION_TO_MODE[action];
  try {
    await bridge.runSetupHelper(helper.id, mode);
    void triggerProviderCatalogRefresh().catch(() => undefined);
    return {
      success: true,
      helperId: helper.id,
      action,
      message: `${helper.label}: ${actionLabel(action).toLowerCase()} complete.`,
    };
  } catch (error) {
    return {
      success: false,
      helperId: helper.id,
      action,
      message: error instanceof Error ? error.message : `${helper.label}: ${action} failed.`,
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
