import { randomUUID } from 'node:crypto';
import type { CompanionNotificationIntent, CompanionDerivedRecord, CompanionSnapshot } from './contracts.js';
import type { CompanionBoxStore } from '../state/companion-box/storeTypes.js';
import { CompanionPostError, companionPostRevision } from './postService.js';
import type { CompanionShareService } from './shareService.js';

type Receipt = { state: 'sent' | 'failed' | 'uncertain' | 'suppressed'; transportMessageId: string | null; error?: string };
export class CompanionNotificationService {
  private running: Promise<void> | null = null;
  private recovered = false;
  constructor(private readonly dependencies: {
    store: CompanionBoxStore; shares: CompanionShareService;
    resolveTarget(catId: string, destination: 'dm' | 'telegram'): Promise<Record<string, string>>;
    authorizeAutomatic?(catId: string): Promise<void>;
    localLink(catId: string, postId: string, revision: number): Promise<{ url: string; post: CompanionDerivedRecord }>;
    send(intent: CompanionNotificationIntent, text: string, assertCurrent: () => Promise<void>): Promise<Receipt>;
    now?(): Date;
  }) {}
  private now() { return (this.dependencies.now?.() ?? new Date()).toISOString(); }

  async enqueue(catId: string, postId: string, destination: 'dm' | 'telegram', options: {
    assertAllowed?(snapshot: CompanionSnapshot): void; retryFailed?: boolean; trigger?: 'owner' | 'heartbeat';
  } = {}) {
    if (!['dm', 'telegram'].includes(destination)) throw new CompanionPostError('invalid_notification_destination');
    const target = await this.dependencies.resolveTarget(catId, destination);
    return this.dependencies.store.transaction(snapshot => {
      options.assertAllowed?.(snapshot);
      const post = snapshot.derived.find(row => `post:${row.id}` === postId && row.catId === catId
        && row.metadata.profileSurface === 'post' && row.metadata.profilePostStatus !== 'removed');
      if (!post) throw new CompanionPostError('companion_post_not_found', 404);
      const revision = companionPostRevision(post);
      const prior = snapshot.notificationIntents.find(row => row.catId === catId && row.postId === postId && row.revision === revision && row.destination === destination);
      if (prior) {
        if (prior.state === 'failed' && options.retryFailed) {
          if ((prior.attempts ?? 1) >= 3) throw new CompanionPostError('notification_retry_limit', 409);
          if (JSON.stringify(prior.target) !== JSON.stringify(target)) throw new CompanionPostError('notification_target_changed', 409);
          if (destination === 'telegram' && !snapshot.shareGrants.some(grant => grant.id === prior.shareGrantId && !grant.revokedAt)) {
            throw new CompanionPostError('post_share_revoked', 409);
          }
          prior.state = 'pending'; prior.error = null; prior.updatedAt = this.now();
        }
        return prior;
      }
      const share = destination === 'telegram' ? this.dependencies.shares.createInSnapshot(snapshot, catId, postId) : null;
      const intent: CompanionNotificationIntent = { id: randomUUID(), catId, postId, revision, destination, target,
        ...(share ? { shareGrantId: share.grantId } : {}),
        trigger: options.trigger ?? 'owner', attempts: 0,
        state: 'pending', transportMessageId: null, error: null, createdAt: this.now(), updatedAt: this.now() };
      snapshot.notificationIntents.push(intent); snapshot.updatedAt = intent.updatedAt;
      return intent;
    });
  }

  isIdle() { return this.running === null; }
  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async run() {
    const { store, shares } = this.dependencies;
    if (!this.recovered) {
      await store.transaction(snapshot => {
        for (const row of snapshot.notificationIntents.filter(row => row.state === 'sending')) {
          // DM append has a durable unique intent marker. Telegram acknowledgement may be lost.
          row.state = row.destination === 'dm' ? 'pending' : 'uncertain'; row.updatedAt = this.now();
        }
      });
      this.recovered = true;
    }
    for (const candidate of (await store.readSnapshot()).notificationIntents.filter(row => row.state === 'pending')) {
      const intent = await store.transaction(snapshot => {
        const row = snapshot.notificationIntents.find(row => row.id === candidate.id && row.state === 'pending');
        if (!row) return null;
        row.state = 'sending'; row.attempts = (row.attempts ?? 0) + 1; row.updatedAt = this.now(); return row;
      });
      if (!intent) continue;
      let receipt: Receipt;
      let started = false;
      try {
        const resolveLink = () => intent.destination === 'dm'
          ? this.dependencies.localLink(intent.catId, intent.postId, intent.revision)
          : shares.link(intent.catId, intent.postId, intent.revision, intent.shareGrantId);
        const assertCurrent = async () => {
          await resolveLink();
          if (intent.trigger === 'heartbeat') await this.dependencies.authorizeAutomatic?.(intent.catId);
          const currentTarget = await this.dependencies.resolveTarget(intent.catId, intent.destination);
          // Read durable revocation last, after all asynchronous recipient/role resolution.
          const snapshot = await store.readSnapshot();
          const row = snapshot.notificationIntents.find(row => row.id === intent.id);
          const post = snapshot.derived.find(row => `post:${row.id}` === intent.postId && row.catId === intent.catId);
          if (!post || post.metadata.profilePostStatus === 'removed' || companionPostRevision(post) !== intent.revision
            || (intent.destination === 'telegram' && !snapshot.shareGrants.some(grant => grant.id === intent.shareGrantId && !grant.revokedAt))) {
            throw new CompanionPostError('publication_notification_revoked', 409);
          }
          if (intent.trigger === 'heartbeat') {
            const settings = snapshot.mediaSettings.find(row => row.catId === intent.catId);
            const life = snapshot.boxes.find(row => row.catId === intent.catId)?.life;
            if (!settings?.autoPost || !settings.notify.includes(intent.destination) || !life || life.mode === 'assist'
              || (intent.destination === 'telegram' && !settings.autoShare)) throw new CompanionPostError('automatic_notification_disabled', 409);
          }
          if (row?.state !== 'sending' || !intent.target || JSON.stringify(currentTarget) !== JSON.stringify(intent.target)) {
            throw new CompanionPostError('notification_target_changed', 409);
          }
        };
        await assertCurrent();
        const link = await resolveLink();
        started = true;
        receipt = await this.dependencies.send(intent, `${link.post.content.slice(0, 1500)}\n\n${link.url}`.trim(), assertCurrent);
      } catch (error) {
        receipt = { state: error instanceof CompanionPostError ? 'suppressed' : started ? 'uncertain' : 'failed',
          transportMessageId: null, error: error instanceof CompanionPostError ? error.code : 'notification_delivery_failed' };
      }
      await store.transaction(snapshot => {
        const row = snapshot.notificationIntents.find(row => row.id === intent.id && row.state === 'sending');
        if (row) { row.state = receipt.state; row.transportMessageId = receipt.transportMessageId; row.error = receipt.error ?? null; row.updatedAt = this.now(); }
      });
    }
  }
}
