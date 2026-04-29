import type { TrimmedSidebarConfig } from '../../renderer/sidebars/types';

/**
 * Trimmed sidebar configs for the Chat / Code / Work tabs. Mobile
 * uses the same five-entry shape across all three product tabs:
 * three primary action chips, the product MY-lens row, the product
 * Recents row.
 *
 * Chat's three primary actions mirror the canonical web entry kinds
 * (+New chat / +Group chat / +Parallel chat). Code's match FR-038
 * (+New code / +Team code / +Peer code). Work mirrors the same
 * shape (+New work / +Team work / +Peer work) — names locked in
 * `536215df` per SPEC-095 Open Question resolution.
 */
export const chatSidebarConfig: TrimmedSidebarConfig = {
  product: 'chat',
  productLabel: 'CHAT',
  primaryActions: [
    { id: 'new', label: '+ New chat' },
    { id: 'group', label: '+ Group chat' },
    { id: 'parallel', label: '+ Parallel chat' },
  ],
  myLensLabel: 'MY CATS',
  recentsLabel: 'Recents (Chat)',
};

export const codeSidebarConfig: TrimmedSidebarConfig = {
  product: 'code',
  productLabel: 'CODE',
  primaryActions: [
    { id: 'new', label: '+ New code' },
    { id: 'team', label: '+ Team code' },
    { id: 'peer', label: '+ Peer code' },
  ],
  myLensLabel: 'MY CODES',
  recentsLabel: 'Recents (Code)',
};

export const workSidebarConfig: TrimmedSidebarConfig = {
  product: 'work',
  productLabel: 'WORK',
  primaryActions: [
    { id: 'new', label: '+ New work' },
    { id: 'team', label: '+ Team work' },
    { id: 'peer', label: '+ Peer work' },
  ],
  myLensLabel: 'MY WORKS',
  recentsLabel: 'Recents (Work)',
};
