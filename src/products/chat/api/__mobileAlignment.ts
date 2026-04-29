/**
 * Compile-time alignment check between the full Chat API contracts in
 * `./contracts.ts` and the narrowed mobile-safe DTOs at
 * `cats-platform/src/mobile/contracts.ts`.
 *
 * The mobile boundary intentionally re-declares narrower shapes
 * because the full contracts pull `node:crypto` through transitive
 * imports (see `cats-platform/scripts/check-mobile-boundary.mjs`).
 * Without this file, the narrow shapes can silently drift from the
 * authoritative server contract — a field rename would still
 * type-check on the wire, leaving mobile reading `undefined` from a
 * field whose name no longer matches.
 *
 * Each `_check*` constant fails to compile if `T extends NarrowT` is
 * no longer true. The constants are unused at runtime; the
 * `void` references suppress the unused-variable warning while still
 * forcing `tsc` to evaluate the conditional types.
 *
 * This file lives in the server-side `api/` tree rather than under
 * `src/mobile/` so the boundary check (`scripts/check-mobile-boundary.mjs`)
 * does not flag its `./contracts.js` import as a violation.
 */

import type {
  MobileChatCat,
  MobileChatChannelSummary,
  MobileChatMessage,
  MobileChatShellState,
  MobileAppShellPayload,
  MobileCreateChannelInput,
} from '../../../mobile/contracts.js';
import type {
  AppShellPayload,
  ChatCat,
  ChatChannelSummary,
  ChatMessage,
  ChatShellState,
  CreateChatChannelInput,
} from './contracts.js';

type AssertExtends<T extends Required, Required> = true;

const _checkChatCat: AssertExtends<ChatCat, MobileChatCat> = true;
const _checkChatChannelSummary: AssertExtends<
  ChatChannelSummary,
  MobileChatChannelSummary
> = true;
const _checkChatMessage: AssertExtends<ChatMessage, MobileChatMessage> = true;
const _checkChatShellState: AssertExtends<ChatShellState, MobileChatShellState> = true;
const _checkAppShellPayload: AssertExtends<
  AppShellPayload,
  MobileAppShellPayload
> = true;
const _checkCreateChannelInput: AssertExtends<
  MobileCreateChannelInput,
  CreateChatChannelInput
> = true;

void _checkChatCat;
void _checkChatChannelSummary;
void _checkChatMessage;
void _checkChatShellState;
void _checkAppShellPayload;
void _checkCreateChannelInput;
