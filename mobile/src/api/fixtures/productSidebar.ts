import type { TrimmedSidebarConfig } from '../../renderer/sidebars/types';

/**
 * Trimmed sidebar configs for the Code and Work tabs. Code's three
 * primary actions are pinned to FR-038 (+New code / +Team code /
 * +Peer code). Work's two presets remain TBD per SPEC-095 Open
 * Questions; the placeholders here keep parity with the Code pattern
 * and will be renamed once the product team confirms.
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
    // TODO(SPEC-095 Open Question): swap these placeholder labels for the
    // two confirmed Work presets once the product team picks them.
    { id: 'preset-1', label: '+ Team work' },
    { id: 'preset-2', label: '+ Peer work' },
  ],
  myLensLabel: 'MY WORKS',
  recentsLabel: 'Recents (Work)',
};
