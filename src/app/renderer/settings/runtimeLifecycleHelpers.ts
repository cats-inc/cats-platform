import {
  resolveDesktopHostBridge,
  type DesktopSetupSnapshot,
  type RuntimeLifecycleHelperMode,
  type RuntimeLifecycleHelperSummary,
  type RuntimeLifecycleLastAction,
} from '../../../shared/desktopRecoveryBridge.js';
import { triggerProviderCatalogRefresh } from '../../../products/shared/renderer/api/providerCatalogRefreshStore.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

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

type RuntimeLifecycleI18n = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultRuntimeLifecycleI18n = createTranslator('en');

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
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
): RuntimeLifecycleActionAvailability[] {
  const actions: RuntimeLifecycleAction[] = ['check', 'install', 'upgrade', 'repair', 'uninstall'];
  const helperLabel = presentRuntimeLifecycleHelperLabel(helper, t);
  return actions.map((action) => ({
    action,
    label: actionLabel(action, t),
    available: helper.supported && helper.available && helperSupportsAction(helper, action),
    reason: !helper.supported
      ? presentRuntimeLifecycleUnsupportedReason(helper.unsupportedReason, t)
      : !helper.available
        ? t(messageKeys.settingsRuntimeHelperUnavailableReason, {
            helperLabel,
          })
        : !helperSupportsAction(helper, action)
          ? t(messageKeys.settingsRuntimeHelperUnsupportedActionReason, {
              helperLabel,
              actionLabel: actionLabel(action, t).toLowerCase(),
            })
          : null,
  }));
}

export function actionLabel(
  action: RuntimeLifecycleAction,
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
): string {
  switch (action) {
    case 'check':
      return t(messageKeys.settingsRuntimeActionCheckLabel);
    case 'install':
      return t(messageKeys.settingsRuntimeActionInstallLabel);
    case 'upgrade':
      return t(messageKeys.settingsRuntimeActionUpgradeLabel);
    case 'repair':
      return t(messageKeys.settingsRuntimeActionRepairLabel);
    case 'uninstall':
      return t(messageKeys.settingsRuntimeActionUninstallLabel);
  }
}

export function presentRuntimeLifecycleHelperLabel(
  helper: Pick<RuntimeLifecycleHelperSummary, 'label'>,
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
): string {
  return localizeRuntimeLifecycleHelperLabel(helper.label, t);
}

function presentRuntimeLifecyclePlatformSupport(
  platformSupport: string,
  t: RuntimeLifecycleI18n,
): string {
  switch (platformSupport) {
    case 'Windows, macOS, or Linux hosts':
      return t(messageKeys.settingsRuntimePlatformSupportAllDesktop);
    case 'Windows hosts':
      return t(messageKeys.settingsRuntimePlatformSupportWindows);
    case 'Windows hosts with WSL support':
      return t(messageKeys.settingsRuntimePlatformSupportWindowsWsl);
    case 'macOS hosts':
      return t(messageKeys.settingsRuntimePlatformSupportMacos);
    case 'Linux hosts':
      return t(messageKeys.settingsRuntimePlatformSupportLinux);
    default:
      return platformSupport;
  }
}

export function presentRuntimeLifecycleUnsupportedReason(
  reason: string | null | undefined,
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
): string | null {
  const text = String(reason ?? '').trim();
  if (!text) {
    return null;
  }

  const match = text.match(/^(.+) is currently only supported on (.+)\.$/u);
  if (!match) {
    return text;
  }

  return t(messageKeys.settingsRuntimeHelperUnsupportedPlatformReason, {
    helperLabel: localizeRuntimeLifecycleHelperLabel(match[1], t),
    platformSupport: presentRuntimeLifecyclePlatformSupport(match[2], t),
  });
}

export function presentRuntimeLifecycleStatus(
  status: string | null | undefined,
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
): string {
  switch (status) {
    case 'auth_required':
      return t(messageKeys.settingsRuntimeLifecycleStatusAuthRequired);
    case 'blocked':
      return t(messageKeys.settingsRuntimeLifecycleStatusBlocked);
    case 'changes_required':
      return t(messageKeys.settingsRuntimeLifecycleStatusChangesRequired);
    case 'failed':
      return t(messageKeys.settingsRuntimeLifecycleStatusFailed);
    case 'not_installed':
      return t(messageKeys.settingsRuntimeLifecycleStatusNotInstalled);
    case 'preview':
      return t(messageKeys.settingsRuntimeLifecycleStatusPreview);
    case 'ready':
      return t(messageKeys.settingsRuntimeLifecycleStatusReady);
    case 'restart_required':
      return t(messageKeys.settingsRuntimeLifecycleStatusRestartRequired);
    case 'uninstalled':
      return t(messageKeys.settingsRuntimeLifecycleStatusUninstalled);
    default:
      return String(status ?? '');
  }
}

export function presentRuntimeLifecycleDetail(
  detail: string | null | undefined,
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
): string {
  switch (detail) {
    case 'Launch the target WSL distro once to finish first-user setup, then rerun the packaged setup check.':
      return t(messageKeys.settingsRuntimeLifecycleDetailLaunchWslFirstBoot);
    case 'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.':
      return t(messageKeys.settingsRuntimeLifecycleDetailStartDockerWarmUp);
    default:
      return presentRuntimeLifecycleStatus(detail, t) || String(detail ?? '');
  }
}

function localizeRuntimeLifecycleHelperLabel(
  label: string,
  t: RuntimeLifecycleI18n,
): string {
  if (label === 'Windows PowerShell + PATH readiness helper') {
    return t(messageKeys.settingsRuntimeHelperLabelWindowsCliReadiness);
  }

  if (label === 'Windows Microsoft Visual C++ 2015-2022 Redistributable (x64)') {
    return t(messageKeys.settingsRuntimeHelperLabelWindowsVcRedist);
  }

  let match = label.match(/^(Windows|Linux|macOS) Node\.js LTS host installer$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelNodeHostInstaller, {
      platform: match[1],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) GitHub CLI host installer$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelGithubCliHostInstaller, {
      platform: match[1],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) npm prefix and PATH prerequisite helper$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelNpmPrefixHelper, {
      platform: match[1],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) setup readiness audit$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelSetupReadinessAudit, {
      platform: match[1],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) packaged setup background process helper$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelPackagedBackgroundProcessHelper, {
      platform: match[1],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) packaged provider uninstall helper$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelPackagedProviderUninstallHelper, {
      platform: match[1],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) packaged npm-global CLI installer helper$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelPackagedNpmGlobalCliInstallerHelper, {
      platform: match[1],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) native (.+) installer$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelNativeProviderInstaller, {
      platform: match[1],
      providerLabel: match[2],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) (.+) local-model installer$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelLocalModelInstaller, {
      platform: match[1],
      providerLabel: match[2],
    });
  }

  match = label.match(/^(Windows|Linux|macOS) (.+) installer$/u);
  if (match) {
    return t(messageKeys.settingsRuntimeHelperLabelProviderInstaller, {
      platform: match[1],
      providerLabel: match[2],
    });
  }

  return label;
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
  t: RuntimeLifecycleI18n,
): RuntimeLifecycleOutcome {
  const lastAction = snapshot?.state?.lastAction ?? null;
  const actionText = actionLabel(action, t).toLowerCase();
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
      message: t(messageKeys.settingsRuntimeActionNoResult, {
        helperLabel: helper.label,
        actionLabel: actionText,
      }),
    };
  }

  const kind = classifyLastActionForAction(lastAction, action);
  const status = lastAction.status;
  const helperLabel = presentRuntimeLifecycleHelperLabel(helper, t);
  const message = (() => {
    if (kind === 'success') {
      return t(
        status === 'not_installed' && action === 'uninstall'
          ? messageKeys.settingsRuntimeActionSuccessNothingToRemove
          : messageKeys.settingsRuntimeActionSuccessComplete,
        {
          helperLabel,
          actionLabel: actionText,
        },
      );
    }
    if (kind === 'partial') {
      const normalizedStatus = status ?? 'changes_required';
      const detail = lastAction.warnings[0] ?? lastAction.manualSteps[0];
      return detail
        ? t(messageKeys.settingsRuntimeActionPartialWithDetail, {
            helperLabel,
            actionLabel: actionText,
            status: presentRuntimeLifecycleStatus(normalizedStatus, t),
            detail: presentRuntimeLifecycleDetail(detail, t),
          })
        : t(messageKeys.settingsRuntimeActionPartial, {
            helperLabel,
            actionLabel: actionText,
            status: presentRuntimeLifecycleStatus(normalizedStatus, t),
          });
    }
    const detail = lastAction.summary || lastAction.warnings[0] || status;
    return detail
      ? t(messageKeys.settingsRuntimeActionFailedWithDetail, {
          helperLabel,
          actionLabel: actionText,
          detail: presentRuntimeLifecycleDetail(detail, t),
        })
      : t(messageKeys.settingsRuntimeActionFailed, {
          helperLabel,
          actionLabel: actionText,
        });
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
  options?: { dryRun?: boolean },
): Promise<DesktopSetupSnapshot | undefined> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.runSetupHelper) {
    return undefined;
  }
  return await bridge.runSetupHelper(helperId, mode, options);
}

export async function runRuntimeLifecycleAction(
  helper: RuntimeLifecycleHelperSummary,
  action: RuntimeLifecycleAction,
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
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
      message: t(messageKeys.settingsRuntimeHostBridgeUnavailableClient),
    };
  }

  try {
    const snapshot = await invokeHelper(helper.id, ACTION_TO_MODE[action]);
    const outcome = buildOutcome(helper, action, snapshot, t);
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
      message: error instanceof Error
        ? error.message
        : t(messageKeys.settingsRuntimeActionFailed, {
            helperLabel: presentRuntimeLifecycleHelperLabel(helper, t),
            actionLabel: actionLabel(action, t).toLowerCase(),
          }),
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
  t: RuntimeLifecycleI18n = defaultRuntimeLifecycleI18n,
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
      message: t(messageKeys.settingsRuntimeHostBridgeUnavailable),
    };
  }

  try {
    const snapshot = await invokeHelper(helper.id, 'uninstall', { dryRun: true });
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
        message: t(messageKeys.settingsRuntimePreviewMissingResult),
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
      message: error instanceof Error ? error.message : t(messageKeys.settingsRuntimePreviewFailed),
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
