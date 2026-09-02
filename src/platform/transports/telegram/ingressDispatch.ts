/**
 * Bounded hand-off for Telegram ingress (SPEC-114 FR-14).
 *
 * Both ingress modes used to await the whole bridge call — including the
 * assistant turn — before releasing the update. That made one slow room stall a
 * binding's long-polling loop and hold a webhook connection open past Telegram's
 * own timeout, which then redelivered the update. Ingress now hands the work off
 * and moves on.
 *
 * Two things this deliberately does *not* do:
 *
 *  - It does not order the work. `bridgeTelegramWebhookToRoom` enters its
 *    per-room lock synchronously at call time and that lock is FIFO, so call
 *    order is already processing order. `dispatch` therefore invokes `work`
 *    synchronously; deferring it to a microtask would silently break that.
 *  - It does not refuse work. A caller that has already consumed an update from
 *    Telegram has nowhere to put a refusal, and dropping it there would be a
 *    silent loss. Admission control belongs to the caller *before* it consumes:
 *    ask `isSaturated` and answer 429 (webhook), or `waitForSlot` and keep the
 *    update in the batch (polling).
 */

/**
 * In-flight bridge calls one key — a bot binding — may have at once.
 *
 * Small on purpose: it exists to stop unbounded accumulation behind a stuck
 * room, not to parallelise a workload.
 */
export const DEFAULT_MAX_TELEGRAM_INGRESS_IN_FLIGHT = 8;

export interface TelegramIngressDispatcher {
  /** True when `key` is at its ceiling. Ask before consuming an update. */
  isSaturated(key: string): boolean;
  /** Resolves once `key` has a free slot. */
  waitForSlot(key: string): Promise<void>;
  /** Starts `work` immediately and tracks it until it settles. Never refuses. */
  dispatch(key: string, work: () => Promise<void>): void;
  inFlight(key: string): number;
  /**
   * Waits for dispatched work to settle.
   *
   * For callers that need quiescence — tests, mainly. Deliberately not part of
   * shutdown: blocking process exit on a provider turn that may run for minutes
   * would trade one hang for another.
   */
  drain(): Promise<void>;
}

export interface TelegramIngressDispatcherOptions {
  maxInFlightPerKey?: number;
}

export function createTelegramIngressDispatcher(
  options: TelegramIngressDispatcherOptions = {},
): TelegramIngressDispatcher {
  const ceiling = options.maxInFlightPerKey ?? DEFAULT_MAX_TELEGRAM_INGRESS_IN_FLIGHT;
  const pendingByKey = new Map<string, Set<Promise<void>>>();

  function pendingFor(key: string): Set<Promise<void>> {
    const existing = pendingByKey.get(key);
    if (existing) {
      return existing;
    }
    const created = new Set<Promise<void>>();
    pendingByKey.set(key, created);
    return created;
  }

  return {
    isSaturated(key: string): boolean {
      return pendingFor(key).size >= ceiling;
    },

    inFlight(key: string): number {
      return pendingFor(key).size;
    },

    async waitForSlot(key: string): Promise<void> {
      const pending = pendingFor(key);
      // Racing settled-tracking promises is safe: every entry removes itself on
      // completion, so the race always resolves.
      while (pending.size >= ceiling) {
        await Promise.race([...pending]);
      }
    },

    dispatch(key: string, work: () => Promise<void>): void {
      const pending = pendingFor(key);
      // Invoked synchronously — see the ordering note above.
      const tracked = work();
      pending.add(tracked);
      void tracked.finally(() => {
        pending.delete(tracked);
      });
    },

    async drain(): Promise<void> {
      // Work can outlive the set it started in, so drain until every key is
      // quiet rather than snapshotting once.
      let outstanding = [...pendingByKey.values()].flatMap((set) => [...set]);
      while (outstanding.length > 0) {
        await Promise.allSettled(outstanding);
        outstanding = [...pendingByKey.values()].flatMap((set) => [...set]);
      }
    },
  };
}
