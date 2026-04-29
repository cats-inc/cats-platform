/**
 * Mobile sidebar data shapes. SPEC-095 keeps Recents + MY CATS contextual
 * subset + Add-cat-in-chat as the canonical Chat sidebar entry set
 * (FR-026, FR-027). The shapes here are minimal subsets of the real web
 * contracts in `cats-platform/src/products/chat/api/contracts.ts` and
 * `cats-platform/src/products/shared/api/workspaceContracts.ts`. Same
 * deferred-import pattern as `types/messageBody.ts` — these go away
 * once Metro / tsconfig path resolution to `cats-platform/src` lands.
 *
 * Edits here MUST stay in lockstep with the web contracts.
 */

export interface SidebarRecentEntry {
  id: string;
  title: string;
  /** Free-form subtitle (last sender, channel kind, etc.). */
  subtitle?: string;
  /** Last activity timestamp, used for sorting and display. */
  updatedAt: number;
}

export type SidebarCatStatus = 'ready' | 'warm' | 'sleeping';

export interface SidebarCatEntry {
  id: string;
  name: string;
  avatarColor?: string | null;
  status: SidebarCatStatus;
}

export interface ChatSidebarData {
  recents: SidebarRecentEntry[];
  cats: SidebarCatEntry[];
}

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
