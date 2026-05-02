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
    summary: options.summary,
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
