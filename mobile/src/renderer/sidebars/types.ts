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
