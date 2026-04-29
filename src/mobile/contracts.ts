/**
 * Mobile-safe DTOs for the chat shell. Each shape here is a *structural
 * subset* of the full server contract in
 * `src/products/chat/api/contracts.ts` — the mobile client receives the
 * heavy payload from `/api/app-shell` over the wire and TypeScript
 * casts it down to these narrower shapes for the rest of the mobile
 * code path.
 *
 * Why subsets and not re-exports of the full types: the full
 * `ChatCat` / `ChatChannelSummary` / `AppShellPayload` transitively
 * import `workspaceContracts.ts`, which transitively imports
 * `guideCatAssist.ts` (`node:crypto`). The mobile-safe boundary
 * (`src/mobile/`) cannot pull that chain — see the boundary check at
 * `cats-platform/scripts/check-mobile-boundary.mjs`.
 *
 * Server-side alignment is enforced at compile time by
 * `src/products/chat/api/__mobileAlignment.ts`, which holds
 * `extends` checks against the full server types. Any field rename
 * or shape drift surfaces in `npm run typecheck` (the server config).
 */

export interface MobileChatCat {
  id: string;
  name: string;
  avatarColor: string | null;
  status: 'active' | 'archived';
  products: string[];
}

export type MobileChatChannelStatus =
  | 'planned'
  | 'configured'
  | 'active'
  | 'watching'
  | 'archived';

export interface MobileChatChannelSummary {
  id: string;
  title: string;
  topic: string;
  status: MobileChatChannelStatus;
  unreadCount: number;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
}

export interface MobileChatShellState {
  channels: MobileChatChannelSummary[];
  cats: MobileChatCat[];
}

export interface MobileAppShellPayload {
  chat: MobileChatShellState;
}

export type MobileChatMessageSenderKind =
  | 'user'
  | 'agent'
  | 'system'
  | 'orchestrator';

export interface MobileChatMessage {
  id: string;
  channelId: string;
  senderKind: MobileChatMessageSenderKind;
  senderName: string;
  body: string;
  mentions: string[];
  createdAt: string;
}

export interface MobileChannelMessagesPayload {
  messages: MobileChatMessage[];
}
