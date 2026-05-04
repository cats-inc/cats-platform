import type { TrimmedSidebarConfig } from '../../renderer/sidebars/types';
import {
  getMobileProductSidebarCopy,
  type MobileProductMode,
} from '../../../../src/mobile/index.js';

const SIDEBAR_ACTION_IDS: Record<
  MobileProductMode,
  TrimmedSidebarConfig['primaryActions'][number]['id'][]
> = {
  chat: ['new', 'group', 'parallel'],
  code: ['new', 'team', 'peer'],
  work: ['new', 'team', 'parallel'],
};

/**
 * Trimmed sidebar configs for the Chat / Code / Work tabs. Mobile
 * uses the same five-entry shape across all three product tabs:
 * three primary action chips, the product MY-lens row, the product
 * Recents row.
 *
 * Chat's MY-lens row is now `DIRECT MESSAGES` to match the web
 * Chat sidebar relabel (PLAN-091 phase 2; SPEC-102 FR-15). Code's and
 * Work's MY-lens rows still surface their product's cat lens label —
 * the empty `My Clowders` / `My Catteries` placeholders that used to
 * sit in the web Code/Work sidebars were removed in the same phase.
 * Phase 5 reshapes the mobile Lobby tab (where the
 * cats / clowders / catteries entity sections live) and may revisit
 * the Code/Work MY-lens labels once that lands.
 *
 * Chat's three primary actions mirror the canonical web entry kinds
 * (+New chat / +Group chat / +Parallel chat). Code's match FR-038
 * (+New code / +Team code / +Peer code). Work mirrors the same
 * shape (+New work / +Team work / +Peer work).
 */
function createSidebarConfig(
  product: MobileProductMode,
  locale?: string | null,
): TrimmedSidebarConfig {
  const copy = getMobileProductSidebarCopy(locale);
  const productCopy = copy.products[product];
  return {
    product,
    productLabel: productCopy.productLabel,
    primaryActions: SIDEBAR_ACTION_IDS[product].map((id) => ({
      id,
      label: productCopy.primaryActions[id] ?? id,
    })) as TrimmedSidebarConfig['primaryActions'],
    myLensLabel: productCopy.myLensLabel,
    recentsLabel: productCopy.recentsLabel,
    emptyCatsLabel: copy.emptyCatsLabel,
    emptyRecentsLabel: copy.emptyRecentsLabel,
    catStatusLabels: copy.statusLabel,
  };
}

export function getChatSidebarConfig(locale?: string | null): TrimmedSidebarConfig {
  return createSidebarConfig('chat', locale);
}

export function getCodeSidebarConfig(locale?: string | null): TrimmedSidebarConfig {
  return createSidebarConfig('code', locale);
}

export function getWorkSidebarConfig(locale?: string | null): TrimmedSidebarConfig {
  return createSidebarConfig('work', locale);
}

export const chatSidebarConfig: TrimmedSidebarConfig = getChatSidebarConfig('en');
export const codeSidebarConfig: TrimmedSidebarConfig = getCodeSidebarConfig('en');
export const workSidebarConfig: TrimmedSidebarConfig = getWorkSidebarConfig('en');
