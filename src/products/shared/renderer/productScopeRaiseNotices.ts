import type { ProductScope } from '../../../shared/productScope.js';

/**
 * SPEC-141 FR-30: where a raise's toast waits. A raise can wait a long time on the conversation's
 * gate while a turn runs, and the owner may open another product, Settings or the Lobby
 * meanwhile, so nothing here lives in one product app's state.
 *
 * - A pending notice waits for the redirect that moves its conversation. The app that redirects
 *   hands it over in the cross-surface handoff, and the new product's app shows it.
 * - A message posted after the raising app is gone goes to the product app mounted now, or to the
 *   next one that mounts. A message about a conversation that app is showing, whose notice still
 *   waits, is left to that conversation's redirect.
 * - One raise at a time across every product app.
 */

const PENDING_TTL_MS = 6 * 60 * 60_000;
const OUTBOX_TTL_MS = 10 * 60_000;

interface PendingNotice {
  target: ProductScope;
  notice: string;
  stagedAt: number;
}

export interface RaiseNoticeMessage {
  /** The conversation the message is about, when it is a raise's outcome. */
  channelId: string | null;
  message: string;
}

const pending = new Map<string, PendingNotice>();
const outbox: Array<RaiseNoticeMessage & { postedAt: number }> = [];
const listeners: Array<(entry: RaiseNoticeMessage) => void> = [];
let raiseInFlight: string | null = null;

/** Take the one raise slot for this conversation; false while another raise runs. */
export function beginRaise(channelId: string): boolean {
  if (raiseInFlight !== null) return false;
  raiseInFlight = channelId;
  return true;
}

export function endRaise(channelId: string): void {
  if (raiseInFlight === channelId) raiseInFlight = null;
}

export function stagePendingRaiseNotice(channelId: string, target: ProductScope, notice: string, now = Date.now()): void {
  pending.set(channelId, { target, notice, stagedAt: now });
}

/** Whether the notice is still waiting for its redirect. */
export function hasPendingRaiseNotice(channelId: string, now = Date.now()): boolean {
  const entry = pending.get(channelId);
  if (entry && now - entry.stagedAt > PENDING_TTL_MS) pending.delete(channelId);
  return pending.has(channelId);
}

/** The notice for a redirect of this conversation to this product, handed over once. */
export function takePendingRaiseNotice(channelId: string, target: ProductScope, now = Date.now()): string | undefined {
  if (!hasPendingRaiseNotice(channelId, now)) return undefined;
  const entry = pending.get(channelId)!;
  if (entry.target !== target) return undefined;
  pending.delete(channelId);
  return entry.notice;
}

export function clearPendingRaiseNotice(channelId: string): void {
  pending.delete(channelId);
}

/** Show a message in the mounted product app, or in the next one to mount within a while. */
export function postRaiseNotice(entry: RaiseNoticeMessage, now = Date.now()): void {
  const listener = listeners.at(-1);
  if (listener) listener(entry); else outbox.push({ ...entry, postedAt: now });
}

export function subscribeRaiseNotices(listener: (entry: RaiseNoticeMessage) => void, now = Date.now()): () => void {
  listeners.push(listener);
  for (const entry of outbox.splice(0)) {
    if (now - entry.postedAt <= OUTBOX_TTL_MS) listener({ channelId: entry.channelId, message: entry.message });
  }
  return () => {
    const index = listeners.lastIndexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/** Tests only. */
export function resetRaiseNoticesForTests(): void {
  pending.clear();
  outbox.splice(0);
  listeners.splice(0);
  raiseInFlight = null;
}
