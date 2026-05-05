/**
 * Sidebar types. Data shapes are aliased from the cats-platform mobile-
 * safe boundary so any drift between the wire DTO and the mobile UX
 * stays caught by `__mobileAlignment.ts`. Callback / interaction
 * shapes (function signatures the screens supply to the components)
 * stay mobile-local — they describe React Native behaviour, not data.
 *
 * Per the 2026-04-29 integrator review (PLAN-084 Phase 4b prep). The
 * Chat tab also consumes `TrimmedProductSidebar` now (matching the
 * Code / Work shape) — operator changed direction after seeing the
 * full inline-recents layout on a small viewport. The full
 * `ChatSidebar` component used during Phase 3 has been removed.
 *
 * 2026-05-05: the trimmed sidebar dropped the MY-lens section
 * entirely (DIRECT MESSAGES / MY CLOWDERS / MY CATTERIES) along with
 * the cat presence chip. Cat, Clowder, and Cattery rosters now live
 * under the Cats tab instead.
 */

export type {
  MobileSidebarRecent as SidebarRecentEntry,
} from '../../../../src/mobile/index.js';

/**
 * Trimmed product sidebar (Chat / Code / Work) per SPEC-095. Each
 * product tab renders three primary action chips followed by a
 * Recents list. Code's Workspaces / Artifacts and Work's Projects /
 * Work Items / Tasks / Runs / Missions remain explicitly out of scope
 * for mobile.
 */
export interface TrimmedSidebarPrimaryAction {
  /** Stable identifier — `new`, `team`, `peer`, `group`,
   *  `parallel`, etc. */
  id: string;
  /** Visible chip label, e.g. `+ New Code`. */
  label: string;
}

export interface TrimmedSidebarConfig {
  product: 'chat' | 'code' | 'work';
  /** Product wordmark for the eyebrow row, e.g. `CHAT`, `CODE`, `WORK`. */
  productLabel: string;
  /** Three primary action chips. */
  primaryActions: [
    TrimmedSidebarPrimaryAction,
    TrimmedSidebarPrimaryAction,
    TrimmedSidebarPrimaryAction,
  ];
  /** Label for the RECENTS row, e.g. `Recents (Code)`. */
  recentsLabel: string;
  /** Empty row copy for the product-scoped recents section. */
  emptyRecentsLabel: string;
}

export interface TrimmedSidebarCallbacks {
  onPrimaryAction: (actionId: string) => void;
  onOpenRecents: () => void;
}
