import { setTimeout as delay } from 'node:timers/promises';
import type { StateDatabase } from '../../../../platform/persistence/state-db/stateDatabase.js';
import { withProfileLock } from '../../../../platform/persistence/state-db/profileLock.js';
import { profileLeaseAlive, type ProfileLease } from './profileLease.js';
import { ProfileStorageError } from './profileFormat.js';
import { ConversationArchiveError } from './archiveJobs.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

/** Caller owns the profile operation lock, or is a native read-only preparation probe. */
export async function reclaimConversationOperations(profile: string, database: StateDatabase,
  channelId: string, reclaim = true): Promise<boolean> {
  let live = false;
  const rows = database.all('select token, lease_token from conversation_operations where channel_id = ?', channelId);
  for (const row of rows) {
    if (typeof row.token !== 'string' || !UUID.test(row.token)
      || typeof row.lease_token !== 'string' || !UUID.test(row.lease_token)) {
      throw new ProfileStorageError('invalid_operation_reservation', 'An unrecognized conversation operation was preserved for recovery.');
    }
    if (await profileLeaseAlive(profile, row.lease_token)) { live = true; continue; }
    if (reclaim) database.run('delete from conversation_operations where token = ? and lease_token = ?', row.token, row.lease_token);
  }
  return live;
}

export async function assertNoLiveConversationOperations(profile: string, database: StateDatabase,
  channelId: string, reclaim = true): Promise<void> {
  if (await reclaimConversationOperations(profile, database, channelId, reclaim)) throw new ConversationArchiveError('archive_active');
}

/** Retiring the exact independent lease is sufficient; stale SQL rows are safely reclaimed.
 * This must keep working after store.close and retry lock contention without its abort signal.
 */
export async function releaseConversationOperation(profile: string, releaseLease: ProfileLease): Promise<void> {
  for (;;) {
    try { await withProfileLock(profile, releaseLease, { timeoutMs: 1000 }); return; }
    catch (error) {
      if ((error as { code?: string })?.code !== 'profile_lock_timeout') throw error;
      await delay(25);
    }
  }
}
