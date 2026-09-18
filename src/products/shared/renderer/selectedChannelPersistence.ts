import { onProviderClientInvalidation } from '../../../app/renderer/providerClientInvalidation.js';
import { persistSelectedChannel } from './api/appShell.js';

/** One write at a time; intermediate selections may be skipped, never reordered. */
export class SelectedChannelPersistence {
  private wanted: { scope: string; id: string } | null = null;
  private controller: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private scope: string | null = null;
  private savedId: string | null = null;

  constructor(private write = persistSelectedChannel) {}

  select(scope: string, id: string): void {
    if (this.scope !== null && this.scope !== scope) this.clear();
    this.scope = scope;
    if (this.wanted?.id === id || (!this.wanted && this.savedId === id)) return;
    this.wanted = { scope, id };
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.flush();
  }

  clear(): void {
    this.wanted = null;
    this.controller?.abort();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.failures = 0;
    this.scope = null;
    this.savedId = null;
  }

  private async flush(): Promise<void> {
    if (this.controller || !this.wanted) return;
    const selected = this.wanted;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let failed = false;
    try {
      await this.write(selected.id, controller.signal);
      if (controller.signal.aborted) throw new Error('Selection persistence reset');
      this.savedId = selected.id;
      if (this.wanted === selected) this.wanted = null;
      this.failures = 0;
    } catch {
      failed = true;
    } finally {
      clearTimeout(timeout);
      this.controller = null;
    }
    if (!this.wanted) return;
    if (!failed || this.wanted !== selected) {
      void this.flush();
      return;
    }
    const delay = Math.min(250 * 2 ** this.failures++, 10_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }
}

export const selectedChannelPersistence = new SelectedChannelPersistence();
onProviderClientInvalidation(() => selectedChannelPersistence.clear());
