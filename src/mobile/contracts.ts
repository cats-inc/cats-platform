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

export type MobilePlatformSurfaceId = 'chat' | 'work' | 'code';

/**
 * Channel-kind classification on the wire. The desktop already
 * resolves this in `toChannelSummary` (see
 * `src/products/chat/state/model/readModels.ts`), considering
 * `channel.channelKind`, `roomMode`, and the participant set, so
 * mobile can read the resolved value directly. Used by
 * `selectMobileProductRecents` to keep direct-lane (DM) channels out
 * of the product Recents lists, mirroring the web Chat sidebar's
 * `isDirectLaneSummary` exclusion.
 */
export type MobileChatChannelKind = 'chat_channel' | 'direct_message';

export interface MobileChatChannelSummary {
  id: string;
  title: string;
  topic: string;
  status: MobileChatChannelStatus;
  unreadCount: number;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
  originSurface?: MobilePlatformSurfaceId | null;
  channelKind?: MobileChatChannelKind;
}

export interface MobileChatShellState {
  channels: MobileChatChannelSummary[];
  cats: MobileChatCat[];
}

/**
 * Owner fields on the AppShell envelope. Mirror the
 * `PlatformOwnerContext` slice the web Settings → General Profile
 * card consumes (`src/shared/platform-contract.ts`).
 */
export interface MobileAppShellPayload {
  chat: MobileChatShellState;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  ownerAvatarColor: string | null;
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

/** Mobile-narrow create-channel input for `POST /api/channels`.
 *  Mirrors `CreateChatChannelInput` from
 *  `src/products/chat/api/contracts.ts` minus the optional fields that
 *  mobile does not need to set. The server defaults the rest. */
export interface MobileCreateChannelInput {
  title: string;
  topic: string;
  originSurface: MobilePlatformSurfaceId;
  entryKind?: 'default' | 'group' | 'direct';
}

export interface MobileCreatedChannel {
  id: string;
  title: string;
}

export interface MobileCreateChannelResponse {
  channel: MobileCreatedChannel;
}

/**
 * Server-Sent Event kinds emitted on `/api/events/chat`. Mirrors the
 * server's `ChatEventKind` union from
 * `src/products/chat/api/chatEventHub.ts` — kept inline here so the
 * boundary does not import the server module (which would drag in
 * `node:crypto` etc. through transitive contracts).
 */
export type MobileChatEventKind =
  | 'room_updated'
  | 'recents_changed'
  | 'unread_changed'
  | 'transport_ingress'
  | 'transport_outbound'
  | 'session_state_changed';

/**
 * Wire payload for one SSE frame on `/api/events/chat`. Mirrors the
 * inline object literal in `eventRoutes.ts` (`writeSseFrame` call):
 * `{ type, channelId, catId, timestamp, detail }`. `detail` is
 * intentionally `unknown` — its shape varies per event kind. For
 * `room_updated` events the detail contains
 * `{ mutation: 'created' | 'updated' | 'message_added', ... }` per
 * `transportEventPublisher.publishRoomMutation`.
 */
export interface MobileChatEvent {
  type: MobileChatEventKind;
  channelId: string | null;
  catId: string | null;
  timestamp: string;
  detail: unknown;
}

/**
 * Convenience type for inspecting `room_updated` event details.
 * Callers narrow `MobileChatEvent.detail` against this when they need
 * to react to specific mutation kinds (e.g. `message_added`).
 */
export interface MobileRoomUpdatedDetail {
  mutation: 'created' | 'updated' | 'message_added';
}
