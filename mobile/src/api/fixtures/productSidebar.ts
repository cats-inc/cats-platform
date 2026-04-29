import type { TrimmedSidebarConfig } from '../../renderer/sidebars/types';

/**
 * Trimmed sidebar configs for the Code and Work tabs. Code's three
 * primary actions are pinned to FR-038 (+New code / +Team code /
 * +Peer code). Work mirrors the same shape (+New work / +Team work /
 * +Peer work) — names locked in `536215df` per SPEC-095 Open Question
 * resolution.
 */
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
