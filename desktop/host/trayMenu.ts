import type {
  DesktopBootstrapPhase,
  DesktopHostAction,
  DesktopHostActionId,
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
