import path from 'node:path';
import { lstat, mkdir, readdir } from 'node:fs/promises';
import { normalizeOwnerLifecycle } from '../../../../core/ownerLifecycle.js';
import { CATS_CORE_STATE_VERSION } from '../../../../core/types.js';
import { createDefaultCoreState } from '../../../../core/model/index.js';
import { applyOwnerLifecycleProjection } from '../../../../core/ownerLifecycleProjection.js';
import type { CatsCoreState } from '../../../../core/types.js';
import { parseProviderExecutionPolicy, assertProviderPolicyBoundary } from '../../../../shared/providerExecutionPolicy.js';
import { writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import { canonicalDigest } from '../../../../platform/persistence/state-db/canonicalJson.js';
import { normalizeImportedChatSnapshot } from '../store.js';
import type { PersistedChatSnapshot } from '../core-snapshot/index.js';
import { bytesDigest, ProfileStorageError, readOptionalFile } from './profileFormat.js';
import type { StorageHooks } from './metadataCommit.js';

export interface BackupFile {
  name: string;
  original: string;
  kind: 'primary' | 'backup' | 'upgrade';
  sha256: string;
}
export interface LegacyBackupManifest {
  format: 1;
  profile: string;
  source: string;
  files: BackupFile[];
}
export interface LegacyImport {
  snapshot: PersistedChatSnapshot;
  manifestPath: string | null;
  previousDigest: string | null;
  sourceDigest: string | null;
}

/** Read-only logical export/admission. Unlike startup, a missing source never creates defaults. */
export async function readLegacyProfileSnapshot(profile: string): Promise<PersistedChatSnapshot> {
  const primary = await readOptionalFile(profile);
  const backup = await readOptionalFile(`${profile}.bak`);
  const current = primary === null ? null : admitLegacyBytes(primary);
  const previous = backup === null ? null : admitLegacyBytes(backup);
  const record = current ?? previous;
  if (!record) throw new ProfileStorageError('missing_legacy_state', 'No readable legacy profile copy is available.');
  return normalizeLegacyRecord(record, !current);
}

export function validateLegacyManifest(value: Record<string, unknown>, profile: string): LegacyBackupManifest {
  const manifest = value as unknown as LegacyBackupManifest;
  const base = path.basename(profile);
  const identity = (name: unknown) => typeof name === 'string' ? (process.platform === 'win32' ? name.toLowerCase() : name) : null;
  if (manifest.format !== 1 || identity(manifest.profile) !== identity(base) || !Array.isArray(manifest.files)
    || manifest.files.length < 1 || !manifest.files.some(file => file && file.name === manifest.source
      && (file.kind === 'primary' || file.kind === 'backup'))) throw invalidManifest();
  const names = new Set<string>(); const originals = new Set<string>();
  for (const file of manifest.files) {
    if (!file || typeof file.original !== 'string' || file.original.includes('/')
      || file.original.includes('\\') || file.original.includes(':')
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)
      || names.has(file.name) || originals.has(identity(file.original)!)) throw invalidManifest();
    if (file.kind === 'primary') {
      if (file.name !== 'primary.json' || identity(file.original) !== identity(base)) throw invalidManifest();
    } else if (file.kind === 'backup') {
      if (file.name !== 'backup.json' || identity(file.original) !== identity(`${base}.bak`)) throw invalidManifest();
    } else if (file.kind !== 'upgrade' || !/^upgrade-\d+\.bak$/u.test(file.name)
      || !identity(file.original)!.startsWith(`${identity(base)}.`) || !identity(file.original)!.endsWith('.bak')) throw invalidManifest();
    names.add(file.name); originals.add(identity(file.original)!);
  }
  return manifest;
}

function invalidManifest(): ProfileStorageError {
  return new ProfileStorageError('invalid_manifest', 'An invalid legacy backup manifest was preserved; no restore or cleanup was performed.');
}

/** Read/admit both primary and ordinary backup before choosing either. Newer data in a
 * backup is never masked by an older primary. Syntax damage may use a recognized backup;
 * unrecognized/future/policy data is always refused, with its original bytes untouched.
 */
export async function prepareLegacyImport(profile: string, hooks: StorageHooks): Promise<LegacyImport> {
  const primary = await readOptionalFile(profile);
  const backup = await readOptionalFile(`${profile}.bak`);
  const primaryRecord = primary === null ? null : admitLegacyBytes(primary);
  const backupRecord = backup === null ? null : admitLegacyBytes(backup);
  const record = primaryRecord ?? backupRecord;
  if (!record && (primary !== null || backup !== null)) {
    throw new ProfileStorageError('unrecognized_profile',
      'Neither profile copy is a recognized legacy state. Original files were preserved.');
  }
  const previousDigest = primary === null ? null : bytesDigest(primary);
  const nameIdentity = (name: string) => process.platform === 'win32' ? name.toLowerCase() : name;
  const baseIdentity = nameIdentity(path.basename(profile));
  if (!record) {
    if ((await readdir(path.dirname(profile))).some(name =>
      nameIdentity(name).startsWith(`${baseIdentity}.pre-state-db-`) || nameIdentity(name) === `${baseIdentity}.leases`)) {
      throw new ProfileStorageError('missing_legacy_state',
        'Previous state artifacts exist but the profile is missing. Restore them instead of creating defaults.');
    }
    return { snapshot: normalizeImportedChatSnapshot(undefined), manifestPath: null,
      previousDigest: null, sourceDigest: null };
  }
  const selected = primaryRecord ? 'primary.json' : 'backup.json';
  const sourceBytes = primaryRecord ? primary! : backup!;
  const files: BackupFile[] = [];
  if (primary !== null) files.push({ name: 'primary.json', original: path.basename(profile),
    kind: 'primary', sha256: bytesDigest(primary) });
  if (backup !== null) files.push({ name: 'backup.json', original: `${path.basename(profile)}.bak`,
    kind: 'backup', sha256: bytesDigest(backup) });
  const names = (await readdir(path.dirname(profile))).filter(name =>
    nameIdentity(name).startsWith(`${baseIdentity}.`) && nameIdentity(name).endsWith('.bak')
    && nameIdentity(name) !== `${baseIdentity}.bak`).sort();
  for (const [index, name] of names.entries()) {
    const bytes = await readOptionalFile(path.join(path.dirname(profile), name));
    if (bytes === null) throw new ProfileStorageError('migration_failed', 'An upgrade backup changed during admission.');
    files.push({ name: `upgrade-${index}.bak`, original: name, kind: 'upgrade', sha256: bytesDigest(bytes) });
  }
  const manifest: LegacyBackupManifest = { format: 1, profile: path.basename(profile), source: selected, files };
  const directory = `${profile}.pre-state-db-${canonicalDigest(manifest).slice(0, 16)}`;
  await mkdir(directory, { recursive: true });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw unrecognized();
  for (const file of files) {
    const original = path.join(path.dirname(profile), file.original);
    const bytes = await readOptionalFile(original);
    if (bytes === null || bytesDigest(bytes) !== file.sha256) {
      throw new ProfileStorageError('migration_failed', 'Legacy state changed while its backup was being made.');
    }
    const saved = path.join(directory, file.name);
    const existing = await readOptionalFile(saved);
    if (existing !== null && bytesDigest(existing) !== file.sha256) {
      throw new ProfileStorageError('migration_failed', 'A different file occupies the legacy backup name.');
    }
    if (existing === null) await writeDurableFile(saved, bytes);
    if (bytesDigest((await readOptionalFile(saved)) ?? '') !== file.sha256) {
      throw new ProfileStorageError('migration_failed', 'A legacy backup did not verify.');
    }
  }
  const manifestPath = path.join(directory, 'manifest.json');
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const previousManifest = await readOptionalFile(manifestPath);
  if (previousManifest !== null && previousManifest.toString('utf8') !== manifestText) {
    throw new ProfileStorageError('migration_failed', 'The legacy backup manifest does not match this import.');
  }
  if (previousManifest === null) await writeDurableFile(manifestPath, manifestText);
  hooks.progress?.('backup_complete');
  await hooks.checkpoint?.('backup_complete');
  // The original bytes and manifest are durable before the pure old-format upgrade runs.
  const snapshot = normalizeLegacyRecord(record, !primaryRecord);
  return { snapshot, manifestPath, previousDigest, sourceDigest: bytesDigest(sourceBytes) };
}

export function normalizeLegacyRecord(record: Record<string, unknown>, recovered = false): PersistedChatSnapshot {
  // Shape/identity checks precede normalization, which deliberately repairs old snapshots.
  const arrays = Object.entries(createDefaultCoreState()).filter(([, value]) => Array.isArray(value))
    .map(([key]) => key);
  for (const key of arrays) {
    const values = record[key];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.some(value => !value || typeof value !== 'object'
      || typeof value.id !== 'string' || value.id.length === 0)
      || new Set(values.map(value => value.id)).size !== values.length) throw unrecognized();
  }
  const normalized = normalizeImportedChatSnapshot(record);
  assertNoDroppedRecords(record, normalized);
  // Only explicit owner deletion/clearing intent may remove source Core records. It is
  // applied by the same Core policy as an ordinary load, not an ad hoc migration exemption.
  let active: CatsCoreState;
  try { active = applyOwnerLifecycleProjection({ ...createDefaultCoreState(), ...record } as CatsCoreState); }
  catch { throw unrecognized(); }
  for (const key of arrays) {
    if (record[key] === undefined) continue;
    const before = (active as unknown as Record<string, Array<{ id: string }>>)[key];
    const after = (normalized as unknown as Record<string, Array<{ id: string }>>)[key];
    const ids = new Set(after.map(value => value.id));
    if (before.some(value => !ids.has(value.id))) throw unrecognized();
  }
  const rawChat = (record.chat ?? record) as Record<string, unknown>;
  if (rawChat.parallelChatGroups !== undefined && rawChat.concurrentGroups !== undefined
    && canonicalDigest(rawChat.parallelChatGroups) !== canonicalDigest(rawChat.concurrentGroups)) throw unrecognized();
  const sourceChat = { ...rawChat,
    parallelChatGroups: rawChat.parallelChatGroups ?? rawChat.concurrentGroups };
  const candidates = [record.updatedAt,
    (rawChat.globalOrchestrator as Record<string, unknown> | undefined)?.updatedAt];
  const fallback = candidates.find((value): value is string =>
    typeof value === 'string' && Number.isFinite(Date.parse(value)));
  const timestamp = fallback ?? '1970-01-01T00:00:00.000Z';
  const snapshot = preserveExtensions(record.chat ? record : {}, normalized, timestamp) as PersistedChatSnapshot;
  snapshot.chat = preserveExtensions(sourceChat, normalized.chat, timestamp) as PersistedChatSnapshot['chat'];
  delete (snapshot.chat as unknown as Record<string, unknown>).concurrentGroups;
  if (recovered && snapshot.ownerLifecycle?.retention.enabled) {
    snapshot.ownerLifecycle.retention.enabled = false;
    snapshot.ownerLifecycle.retention.lastError = 'Automatic cleanup was disabled after profile recovery. Review the policy before enabling it again.';
    snapshot.ownerLifecycle.revision++;
  }
  return snapshot;
}

export function admitLegacyBytes(bytes: Buffer): Record<string, unknown> | null {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unrecognized();
  const record = value as Record<string, unknown>;
  if (record.version !== undefined && (!Number.isInteger(record.version)
    || Number(record.version) < 1 || Number(record.version) > CATS_CORE_STATE_VERSION)) {
    throw new ProfileStorageError('newer_profile', 'A profile copy has an unsupported version; use its matching build.');
  }
  const chat = (record.chat ?? record) as Record<string, unknown> | null;
  if (!chat || !Array.isArray(chat.cats) || !Array.isArray(chat.channels)) throw unrecognized();
  normalizeOwnerLifecycle(record.ownerLifecycle);
  for (const value of chat.channels) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.messages)) throw unrecognized();
    const policy = parseProviderExecutionPolicy(value.runtimeExecutionPolicy);
    assertProviderPolicyBoundary(policy, {
      workspaceAccess: value.runtimeWorkspaceAccess, permissionMode: value.runtimePermissionMode,
    });
  }
  return record;
}

function assertNoDroppedRecords(raw: Record<string, unknown>, normalized: PersistedChatSnapshot): void {
  const chat = (raw.chat ?? raw) as Record<string, unknown>;
  for (const key of ['cats', 'channels'] as const) {
    const before = chat[key] as Array<{ id?: unknown }>;
    const after = normalized.chat[key];
    const ids = new Set(after.map(value => value.id));
    if (before.length !== after.length || before.some(item =>
      typeof item?.id !== 'string' || !ids.has(item.id))) throw unrecognized();
  }
  const channels = chat.channels as Array<{ id: string; messages: Array<{ id?: unknown }> }>;
  const targets = new Map(normalized.chat.channels.map(channel => [channel.id, channel]));
  for (const source of channels) {
    const target = targets.get(source.id)!;
    const ids = new Set(target.messages.map(message => message.id));
    if (source.messages.length !== target.messages.length || source.messages.some(message =>
      typeof message?.id !== 'string' || !ids.has(message.id))) throw unrecognized();
  }
  const groups = chat.parallelChatGroups ?? chat.concurrentGroups;
  if (groups !== undefined) {
    if (!Array.isArray(groups) || groups.length !== normalized.chat.parallelChatGroups.length) throw unrecognized();
    const targets = new Map(normalized.chat.parallelChatGroups.map(group => [group.id, group]));
    for (const group of groups) {
      const target = targets.get(group?.id);
      if (!target || !Array.isArray(group.memberChannelIds)
        || group.memberChannelIds.length !== target.memberChannelIds.length) throw unrecognized();
    }
  }
}

/** Retain extension fields on complete JSON records while applying recognized upgrades.
 * Match entity arrays by identity rather than position; normalized order stays authoritative.
 */
function preserveExtensions(raw: unknown, normalized: unknown, timestamp: string): unknown {
  if (Array.isArray(normalized)) {
    const before = Array.isArray(raw) ? raw : [];
    const keyed = new Map(before.filter(value => value && typeof value === 'object' && typeof value.id === 'string')
      .map(value => [value.id, value]));
    return normalized.map((value, index) => preserveExtensions(
      value && typeof value === 'object' && typeof value.id === 'string' ? keyed.get(value.id) : before[index], value, timestamp));
  }
  if (normalized && typeof normalized === 'object') {
    const before = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const after = normalized as Record<string, unknown>;
    const result: Record<string, unknown> = { ...before, ...after };
    for (const key of Object.keys(after)) {
      // Rebuilding Core projections normally advances write timestamps. A format import
      // is not new work: retain historical values; newly projected records use source time.
      result[key] = key === 'updatedAt' && typeof after[key] === 'string'
        && Number.isFinite(Date.parse(after[key] as string))
        ? typeof before[key] === 'string' && Number.isFinite(Date.parse(before[key] as string)) ? before[key] : timestamp
        : preserveExtensions(before[key], after[key], timestamp);
    }
    return result;
  }
  return normalized;
}

function unrecognized(): ProfileStorageError {
  return new ProfileStorageError('unrecognized_profile', 'Legacy state is invalid or an upgrade would omit records; original data was preserved.');
}
