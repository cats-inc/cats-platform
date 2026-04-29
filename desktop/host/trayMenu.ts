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

interface BuildDesktopTrayMenuStateOptions {
  phase: DesktopBootstrapPhase;
  summary: string;
  setupCompleteAt: string | null;
  fallbackSetupCompleteAt?: string | null;
  actions: ReadonlyArray<Pick<DesktopHostAction, 'id' | 'label' | 'primary'>>;
  products: ReadonlyArray<DesktopTrayProductDescriptor> | null | undefined;
}

const TRAY_PRIMARY_ACTION_IDS = new Set<DesktopHostActionId>([
  'open_chat',
  'open_setup',
  'resume_setup',
  'retry',
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

function toTrayProductLabel(productName: string): string {
  const trimmed = productName.trim();
  return trimmed.startsWith('Cats ')
    ? `Open ${trimmed.slice('Cats '.length)}`
    : `Open ${trimmed}`;
}

export function buildDesktopTrayMenuState(
  options: BuildDesktopTrayMenuStateOptions,
): DesktopTrayMenuState {
  const effectiveSetupCompleteAt = options.setupCompleteAt ?? options.fallbackSetupCompleteAt ?? null;
  const products = effectiveSetupCompleteAt
    ? (options.products ?? [])
      .filter(isVisibleTrayProduct)
      .map((product) => ({
        id: product.id?.trim() || product.routePrefix!.trim(),
        label: toTrayProductLabel(product.productName!.trim()),
        path: product.routePrefix!.trim(),
      }))
    : [];

  return {
    phase: options.phase,
    summary: options.summary,
    setupCompleteAt: effectiveSetupCompleteAt,
    actions: options.actions.filter((action) => TRAY_PRIMARY_ACTION_IDS.has(action.id)),
    products,
  };
}

export function buildDesktopTrayQuittingMenuState(): DesktopTrayMenuState {
  return {
    summary: 'Quitting...',
    setupCompleteAt: null,
    actions: [],
    products: [],
    lockedLabel: 'Quitting...',
    lockedTooltip: 'Cats — quitting',
  };
}
