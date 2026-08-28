import type {
  DesktopBootstrapPhase,
  DesktopHostAction,
  DesktopHostActionId,
  DesktopUpdateSnapshot,
} from './contracts.js';

export interface DesktopTrayProductDescriptor {
  id?: string;
  productName?: string;
  routePrefix?: string;
  installState?: string;
  setup?: {
    selectable?: boolean;
    disabledReason?: string;
  } | null;
}

/**
 * Tray update entry. Absent entirely when the build has no update capability,
 * so an unofficial or development package never shows a command it cannot
 * honour.
 */
export interface DesktopTrayUpdateItem {
  label: string;
  enabled: boolean;
  /**
   * What activating the item should do.
   *
   * `update` is the whole flow behind one decision -- confirm, download,
   * install, relaunch -- because a menu item that changes meaning between
   * clicks makes the manager's state machine the user's workflow. Every
   * mainstream updater asks once and then finishes; none asks three times.
   *
   * `install` is the recovery path only: a download that landed without the
   * install following it (the confirmation was declined, or the handoff
   * failed) leaves a downloaded update the user can still apply.
   */
  intent: 'check' | 'update' | 'install';
}

export interface DesktopTrayMenuState {
  // Phase drives the fallback status label rendered when the menu is
  // otherwise empty. Locked states (see lockedLabel) short-circuit before
  // phase is read, so the field is optional for those cases — callers that
  // build a real bootstrap-driven menu still set it.
  phase?: DesktopBootstrapPhase;
  summary: string;
  setupCompleteAt: string | null;
  actions: Array<Pick<DesktopHostAction, 'id' | 'label' | 'primary'>>;
  products: Array<{
    id: string;
    label: string;
    path: string;
  }>;
  // When set, the menu is replaced by a single disabled item with this
  // label and every interaction entry-point is short-circuited. Used while
  // shutdownHost drains services so the tray icon stays visible but the
  // menu cannot be re-triggered.
  lockedLabel?: string;
  // Optional tooltip override for locked states. Defaults to lockedLabel
  // when omitted so callers do not have to repeat themselves; setting it
  // explicitly lets the tooltip carry richer status (e.g. service count).
  lockedTooltip?: string;
  // Present only for builds whose capability allows update checks. Rendered
  // before Settings and Quit.
  updateItem?: DesktopTrayUpdateItem | null;
  // Hover text for the tray icon. Carries download progress, which a menu
  // item cannot: an open native menu does not repaint when the menu behind it
  // is rebuilt, so the percentage there is only visible to someone who closes
  // and reopens it.
  tooltip?: string;
}

export type DesktopTrayLocale = 'en' | 'zh-TW';

interface BuildDesktopTrayMenuStateOptions {
  phase: DesktopBootstrapPhase;
  summary: string;
  setupCompleteAt: string | null;
  fallbackSetupCompleteAt?: string | null;
  actions: ReadonlyArray<Pick<DesktopHostAction, 'id' | 'label' | 'primary'>>;
  products: ReadonlyArray<DesktopTrayProductDescriptor> | null | undefined;
  locale?: string | null;
  updates?: DesktopUpdateSnapshot | null;
}

const TRAY_PRIMARY_ACTION_IDS = new Set<DesktopHostActionId>([
  'open_chat',
  'open_setup',
  'resume_setup',
  'retry',
  'retry_cli_scan',
]);

const ZH_TW_TRAY_SUMMARY_BY_ENGLISH: Record<string, string> = {
  'Starting Cats services.': '正在啟動 Cats 服務。',
  'Starting local Cats services and waiting for readiness.':
    '正在啟動本機 Cats 服務並等待就緒。',
  'Local services are ready. Running prerequisite checks.':
    '本機服務已就緒。正在執行先決條件檢查。',
  'Local services are ready. Checking local CLI inventory.':
    '本機服務已就緒。正在檢查本機 CLI 清單。',
  'No CLI is currently installed. Install one to continue using Cats.':
    '目前未安裝任何 CLI。請安裝至少一個 CLI 以繼續使用 Cats。',
  'Welcome. Install a CLI to get started with Cats.':
    '歡迎。請安裝 CLI 開始使用 Cats。',
  'Desktop services are ready. Continue into setup.':
    '桌面服務已就緒。請繼續進入設定。',
  'Desktop services are ready. Continue into setup to choose a provider path.':
    '桌面服務已就緒。請繼續進入設定以選擇供應器路徑。',
  'Cats Runtime is unavailable. Open Cats to recover in-app once the runtime is back.':
    'Cats 執行階段無法使用。執行階段恢復後，請開啟 Cats 在應用程式內復原。',
  'Cats Runtime setup is still required. Continue into setup.':
    'Cats 執行階段仍需要設定。請繼續進入設定。',
  'Desktop services and at least one provider path are ready.':
    '桌面服務與至少一個供應器路徑已就緒。',
  'Desktop services are ready. Opening Cats without a startup provider reprobe.':
    '桌面服務已就緒。將開啟 Cats，不重新執行啟動供應器檢查。',
  'Cats needs provider recovery, but setup remains complete and Cats can still open.':
    'Cats 需要供應器復原，但設定仍已完成，Cats 仍可開啟。',
};

function isVisibleTrayProduct(product: DesktopTrayProductDescriptor): boolean {
  const routePrefix = product.routePrefix?.trim();
  if (!routePrefix?.startsWith('/')) {
    return false;
  }
  if (product.installState === 'available' || product.installState === 'installing') {
    return false;
  }
  if (product.setup?.selectable === false) {
    return false;
  }
  if (product.setup?.disabledReason?.trim()) {
    return false;
  }
  return Boolean(product.productName?.trim());
}

export function normalizeDesktopTrayLocale(
  locale: string | null | undefined,
): DesktopTrayLocale {
  const normalized = locale?.replace(/_/gu, '-').toLowerCase() ?? '';
  return normalized === 'zh-tw'
    || normalized === 'zh-hant'
    || normalized.startsWith('zh-tw-')
    || normalized.startsWith('zh-hant-')
    ? 'zh-TW'
    : 'en';
}

function localizeTrayActionLabel(
  action: Pick<DesktopHostAction, 'id' | 'label'>,
  locale: DesktopTrayLocale,
): string {
  if (locale !== 'zh-TW') {
    return action.label;
  }

  switch (action.id) {
    case 'open_chat':
      return '開啟 Cats';
    case 'open_setup':
      return '開啟設定';
    case 'resume_setup':
      return '繼續封裝設定';
    case 'retry':
    case 'retry_cli_scan':
      return '重試';
    default:
      return action.label;
  }
}

function localizeTraySummary(summary: string, locale: DesktopTrayLocale): string {
  if (locale !== 'zh-TW') {
    return summary;
  }
  return ZH_TW_TRAY_SUMMARY_BY_ENGLISH[summary] ?? summary;
}

function toTrayProductLabel(productName: string, locale: DesktopTrayLocale): string {
  const trimmed = productName.trim();
  if (locale === 'zh-TW') {
    if (trimmed === 'Cats Chat') {
      return '開啟聊天';
    }
    if (trimmed === 'Cats Work') {
      return '開啟工作';
    }
    if (trimmed === 'Cats Code') {
      return '開啟程式碼';
    }
    return trimmed.startsWith('Cats ')
      ? `開啟 ${trimmed.slice('Cats '.length)}`
      : `開啟 ${trimmed}`;
  }
  return trimmed.startsWith('Cats ')
    ? `Open ${trimmed.slice('Cats '.length)}`
    : `Open ${trimmed}`;
}

const TRAY_UPDATE_LABELS: Record<DesktopTrayLocale, Record<string, string>> = {
  en: {
    check: 'Check for Updates…',
    checking: 'Checking for Updates…',
    update: 'Update to {version}…',
    updateUnversioned: 'Update Cats…',
    downloading: 'Downloading Update…',
    downloaded: 'Restart to Update…',
    installing: 'Installing Update…',
  },
  'zh-TW': {
    check: '檢查更新…',
    checking: '正在檢查更新…',
    update: '更新到 {version}…',
    updateUnversioned: '更新 Cats…',
    downloading: '正在下載更新…',
    downloaded: '重新啟動以更新…',
    installing: '正在安裝更新…',
  },
};

/**
 * Derives the tray update entry from the host-owned snapshot.
 *
 * Labels stay truthful about what the host is doing, and every state that has
 * an operation in flight is disabled so a second request cannot be started
 * from the tray.
 */
export function buildDesktopTrayUpdateItem(
  snapshot: DesktopUpdateSnapshot | null | undefined,
  localeInput?: string | null,
): DesktopTrayUpdateItem | null {
  if (!snapshot?.capability.canCheck) {
    return null;
  }

  const locale = normalizeDesktopTrayLocale(localeInput);
  const labels = TRAY_UPDATE_LABELS[locale];
  // A preview build self-updates, so the tray has to say what it is or a
  // tester cannot tell it apart from a supported release.
  const suffix = snapshot.capability.distribution === 'preview_packaged'
    ? (locale === 'zh-TW' ? '（預覽）' : ' (preview)')
    : '';

  const withSuffix = (item: DesktopTrayUpdateItem): DesktopTrayUpdateItem => ({
    ...item,
    label: `${item.label}${suffix}`,
  });

  return withSuffix(resolveTrayUpdateItem(snapshot, labels));
}

function resolveTrayUpdateItem(
  snapshot: DesktopUpdateSnapshot,
  labels: Record<string, string>,
): DesktopTrayUpdateItem {
  switch (snapshot.status) {
    case 'checking':
      return { label: labels.checking, enabled: false, intent: 'check' };
    case 'update_available': {
      // Name the destination. "Update to 0.1.15…" tells the user what the one
      // click buys; "Download Update…" described a step, which is how the item
      // ended up meaning something different every time it was opened.
      const label = snapshot.availableVersion
        ? labels.update.replace('{version}', snapshot.availableVersion)
        : labels.updateUnversioned;
      return { label, enabled: true, intent: 'update' };
    }
    case 'downloading': {
      const percent = Math.round(snapshot.progress?.percent ?? 0);
      return { label: `${labels.downloading} ${percent}%`, enabled: false, intent: 'check' };
    }
    case 'downloaded':
      return { label: labels.downloaded, enabled: true, intent: 'install' };
    case 'installing':
      return { label: labels.installing, enabled: false, intent: 'check' };
    default:
      return { label: labels.check, enabled: true, intent: 'check' };
  }
}

/**
 * Hover text for the tray icon.
 *
 * Only download progress overrides the plain product name: it is the one piece
 * of update state that changes while the user is waiting and has nowhere else
 * to be seen. The menu item shows the same percentage, but a native menu that
 * is already open does not repaint when the menu behind it is rebuilt, so a
 * user watching the download would have to keep closing and reopening it.
 */
export function buildDesktopTrayTooltip(
  snapshot: DesktopUpdateSnapshot | null | undefined,
  localeInput?: string | null,
): string {
  if (!snapshot?.capability.canCheck || snapshot.status !== 'downloading') {
    return 'Cats';
  }

  const labels = TRAY_UPDATE_LABELS[normalizeDesktopTrayLocale(localeInput)];
  const percent = Math.round(snapshot.progress?.percent ?? 0);
  return `Cats — ${labels.downloading} ${percent}%`;
}

export function buildDesktopTrayMenuState(
  options: BuildDesktopTrayMenuStateOptions,
): DesktopTrayMenuState {
  const effectiveSetupCompleteAt = options.setupCompleteAt ?? options.fallbackSetupCompleteAt ?? null;
  const locale = normalizeDesktopTrayLocale(options.locale);
  const products = effectiveSetupCompleteAt
    ? (options.products ?? [])
      .filter(isVisibleTrayProduct)
      .map((product) => ({
        id: product.id?.trim() || product.routePrefix!.trim(),
        label: toTrayProductLabel(product.productName!.trim(), locale),
        path: product.routePrefix!.trim(),
      }))
    : [];

  return {
    phase: options.phase,
    summary: localizeTraySummary(options.summary, locale),
    setupCompleteAt: effectiveSetupCompleteAt,
    actions: options.actions
      .filter((action) => TRAY_PRIMARY_ACTION_IDS.has(action.id))
      .map((action) => ({
        ...action,
        label: localizeTrayActionLabel(action, locale),
      })),
    products,
    updateItem: buildDesktopTrayUpdateItem(options.updates, options.locale),
    tooltip: buildDesktopTrayTooltip(options.updates, options.locale),
  };
}

export function buildDesktopTrayQuittingMenuState(
  localeInput?: string | null,
): DesktopTrayMenuState {
  const locale = normalizeDesktopTrayLocale(localeInput);
  const lockedLabel = locale === 'zh-TW' ? '正在結束...' : 'Quitting...';
  return {
    summary: lockedLabel,
    setupCompleteAt: null,
    actions: [],
    products: [],
    lockedLabel,
    lockedTooltip: locale === 'zh-TW' ? 'Cats — 正在結束' : 'Cats — quitting',
  };
}
