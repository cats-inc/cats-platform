import type {
  MobileSidebarCatStatus as SidebarCatStatus,
} from '../../../../src/mobile/index.js';

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
 */

export type {
  MobileChatSidebarData as ChatSidebarData,
  MobileSidebarCat as SidebarCatEntry,
  MobileSidebarRecent as SidebarRecentEntry,
} from '../../../../src/mobile/index.js';

export type { SidebarCatStatus };

/**
 * Trimmed product sidebar (Chat / Code / Work) per SPEC-095. All
 * three product tabs now use the same five-entry shape: three
 * primary actions, the product MY-lens row, the product Recents
 * row. Code's Workspaces / Artifacts and Work's Projects / Work
 * Items / Tasks / Runs / Missions remain explicitly out of scope
 * for mobile.
 */
export interface TrimmedSidebarPrimaryAction {
  /** Stable identifier — `new`, `team`, `peer`, `group`,
   *  `parallel`, etc. */
  id: string;
  /** Visible chip label, e.g. `+ New code`. */
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
  /** Label for the MY-lens row, e.g. `MY CATS` / `MY CODES` / `MY WORKS`. */
  myLensLabel: string;
  /** Label for the RECENTS row, e.g. `Recents (Code)`. */
  recentsLabel: string;
  /** Empty row copy for the product-specific MY-lens section. */
  emptyCatsLabel: string;
  /** Empty row copy for the product-scoped recents section. */
  emptyRecentsLabel: string;
  /** Visible status labels for cat presence chips. */
  catStatusLabels: Record<SidebarCatStatus, string>;
}

export interface TrimmedSidebarCallbacks {
  onPrimaryAction: (actionId: string) => void;
  onOpenMyLens: () => void;
  onOpenRecents: () => void;
}
