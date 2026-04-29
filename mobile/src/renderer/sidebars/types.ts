/**
 * Sidebar types. Data shapes are aliased from the cats-platform mobile-
 * safe boundary so any drift between the wire DTO and the mobile UX
 * stays caught by `__mobileAlignment.ts`. Callback / interaction
 * shapes (function signatures the screens supply to the components)
 * stay mobile-local — they describe React Native behaviour, not data.
 *
 * Per the 2026-04-29 integrator review (PLAN-084 Phase 4b prep).
 */

export type {
  MobileChatSidebarData as ChatSidebarData,
  MobileSidebarCat as SidebarCatEntry,
  MobileSidebarCatStatus as SidebarCatStatus,
  MobileSidebarRecent as SidebarRecentEntry,
} from '../../../../src/mobile/index.js';

export interface ChatSidebarCallbacks {
  onStartNewChat: () => void;
  onStartNewGroupChat: () => void;
  onStartNewParallelChat: () => void;
  onSelectRecent: (channelId: string) => void;
  onSelectCat: (catId: string) => void;
  onCreateNewCat: () => void;
}

/**
 * Trimmed product sidebar (Code / Work) per SPEC-095 #10 / #13. Exactly
 * five entries: three primary actions, the product's MY-lens link, the
 * product's RECENTS link. Workspaces / Artifacts (Code) and Projects /
 * Work Items / Tasks / Runs / Missions (Work) are intentionally absent
 * on mobile.
 */
export interface TrimmedSidebarPrimaryAction {
  /** Stable identifier — `new`, `team`, `peer`, etc. */
  id: string;
  /** Visible chip label, e.g. `+ New code`. */
  label: string;
}

export interface TrimmedSidebarConfig {
  product: 'code' | 'work';
  /** Product wordmark for the eyebrow row, e.g. `CODE`, `WORK`. */
  productLabel: string;
  /** Three primary action chips. */
  primaryActions: [
    TrimmedSidebarPrimaryAction,
    TrimmedSidebarPrimaryAction,
    TrimmedSidebarPrimaryAction,
  ];
  /** Label for the MY-lens row, e.g. `MY CODES` / `MY WORKS`. */
  myLensLabel: string;
  /** Label for the RECENTS row, e.g. `Recents (Code)`. */
  recentsLabel: string;
}

export interface TrimmedSidebarCallbacks {
  onPrimaryAction: (actionId: string) => void;
  onOpenMyLens: () => void;
  onOpenRecents: () => void;
}
