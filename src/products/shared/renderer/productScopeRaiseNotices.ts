import type { ProductScope } from '../../../shared/productScope.js';

/**
 * SPEC-141 FR-30: where a raise's toast waits. A raise can wait minutes on the conversation's
 * gate while a turn runs, and the owner may open another product, Settings or the Lobby
 * meanwhile, so nothing here lives in one product app's state.
 *
 * - A pending notice waits for the redirect that moves its conversation. The app that redirects
 *   hands it over in the cross-surface handoff, and the new product's app shows it.
 * - A message posted after the raising app is gone goes to the product app mounted now, or to the
 *   next one that mounts.
 */

const PENDING_TTL_MS = 30 * 60_000;

interface PendingNotice {
  target: ProductScope;
  notice: string;
  stagedAt: number;
}

const pending = new Map<string, PendingNotice>();
const outbox: string[] = [];
const listeners: Array<(message: string) => void> = [];

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

/** Show a message in the mounted product app, or in the next one to mount. */
export function postRaiseNotice(message: string): void {
  const listener = listeners.at(-1);
  if (listener) listener(message); else outbox.push(message);
}

export function subscribeRaiseNotices(listener: (message: string) => void): () => void {
  listeners.push(listener);
  for (const message of outbox.splice(0)) listener(message);
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
}
