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
 * MY-lens labels follow the cats-themed naming the platform already
 * uses elsewhere:
 *   • Chat → MY CATS (individual cats)
 *   • Code → MY CLOWDERS (a clowder is a group of cats)
 *   • Work → MY CATTERIES (a cattery is a place that houses cats)
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
