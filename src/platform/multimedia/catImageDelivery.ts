import { CatImageLedger } from './catImageLedger.js';
import type { CatImageJob } from './catImagePolicy.js';

export interface CatImageDeliveryResult {
  status: 'sent' | 'retryable' | 'failed' | 'uncertain' | 'suppressed';
  receiptId?: string | null;
  transportMessageId?: string | null;
  error?: string | null;
  retryAfterSeconds?: number;
}

/** Durable delivery coordination; Chat messages and Telegram remain injected product/transport ports. */
export function createCatImageDelivery(options: {
  ledger: CatImageLedger;
  authorize(job: CatImageJob): Promise<void>;
  append(job: CatImageJob, assertClaim: () => void): Promise<string>;
  deliver(job: CatImageJob, assertClaim: () => void): Promise<CatImageDeliveryResult>;
  now(): Date;
}) {
  let pending: Promise<void> | undefined;
  let closed = false;
  async function sweep(): Promise<void> {
    options.ledger.recoverDeliveries(options.now());
    for (const job of options.ledger.list().filter(job => job.status === 'succeeded')) {
      if (closed) return;
      options.ledger.ensureDelivery(job.id, options.now());
      const claim = options.ledger.claimDelivery(job.id, options.now());
      if (!claim) continue;
      const finish = (patch: Parameters<CatImageLedger['finishDelivery']>[2]) =>
        options.ledger.finishDelivery(job.id, claim.attemptId!, patch, options.now());
      const assertClaim = () => options.ledger.assertDeliveryClaim(job.id, claim.attemptId!);
      try { await options.authorize(job); }
      catch { finish({ status: 'suppressed', error: 'image_not_authorized' }); continue; }
      try {
        assertClaim();
        const messageId = await options.append(job, assertClaim);
        assertClaim();
        finish({ messageId });
      } catch { finish({ status: 'failed', error: 'image_message_append_failed' }); continue; }
      // Sleeping, binding changes and policy revocation may occur while the message is appended.
      try { await options.authorize(job); }
      catch { finish({ status: 'suppressed', error: 'image_not_authorized' }); continue; }
      try {
        assertClaim();
        const result = await options.deliver(job, assertClaim);
        const retry = result.status === 'retryable' && claim.attempts < 3;
        finish({ status: retry ? 'pending' : result.status === 'retryable' ? 'failed' : result.status,
          receiptId: result.receiptId ?? null, transportMessageId: result.transportMessageId ?? null,
          error: result.error ?? null,
          ...(retry ? { nextAttemptAt: new Date(options.now().getTime()
            + Math.max(10, Math.min(3600, result.retryAfterSeconds ?? 30)) * 1000).toISOString() } : {}) });
      } catch { finish({ status: 'uncertain', error: 'delivery_acknowledgement_missing' }); }
    }
  }
  return { tick(): Promise<void> {
    if (closed) return Promise.resolve();
    if (!pending) pending = sweep().finally(() => { pending = undefined; });
    return pending;
  }, isIdle: () => !pending, async close() { closed = true; await pending; } };
}
