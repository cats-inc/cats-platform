import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { CATS_CORE_STATE_VERSION, type CatsCoreState } from '../../../../core/types.js';
import { normalizeOwnerLifecycle } from '../../../../core/ownerLifecycle.js';
import { createDefaultCoreState } from '../../../../core/model/index.js';
import type { PersistedChatSnapshot } from '../core-snapshot/index.js';
import type { ChatState } from '../../api/contracts.js';

export const DATABASE_PROFILE_VERSION = 8;
export const STATE_STORAGE_FAILURE_EXIT_CODE = 78;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const CORE_ARRAYS = Object.entries(createDefaultCoreState())
  .filter(([, value]) => Array.isArray(value)).map(([key]) => key);

export class ProfileStorageError extends Error {
  readonly fatal = true;
  constructor(readonly code: string, message: string, diagnostic?: {
    phase: 'lock' | 'opening' | 'recovering' | 'operation';
    sourceCode: string;
    sqliteResultCode?: number;
  }) {
    // A classified failure may retain only internally selected codes, never the
    // original exception, which can contain stored JSON, SQL or private paths.
    super(message, diagnostic ? { cause: diagnostic } : undefined); this.name = 'ProfileStorageError';
  }
}

export interface StorageAddress {
  engine: 'sqlite';
  protocol: 1;
  database: string;
  installationId: string;
  revision: string;
}

export interface StorageEnvelope extends Omit<PersistedChatSnapshot, 'version'> {
  version: typeof DATABASE_PROFILE_VERSION;
  storage: StorageAddress;
}

/** Windows accepts case aliases for the same local filename; other hosts do not. */
export function storageNameIdentity(name: string): string {
  return process.platform === 'win32' ? name.toLowerCase() : name;
}

export function databasePath(profile: string): string {
  const absolute = path.resolve(profile);
  if (process.platform === 'win32' && /^(?:\\\\|\/\/)/u.test(absolute)) {
    throw new ProfileStorageError('unsupported_location',
      'The conversation database needs local storage; network-share profiles are unsupported.');
  }
  return /\.json$/iu.test(absolute) ? absolute.replace(/\.json$/iu, '.sqlite') : `${absolute}.sqlite`;
}

export function bytesDigest(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readOptionalFile(file: string): Promise<Buffer | null> {
  try {
    if (!(await lstat(file)).isFile()) {
      throw new ProfileStorageError('unrecognized_file', 'State files must be regular files, not links.');
    }
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function parseJsonRecord(text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new ProfileStorageError('unrecognized_profile', 'The state profile is not valid JSON; its bytes were preserved.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProfileStorageError('unrecognized_profile', 'The state profile has an unrecognized shape.');
  }
  return value as Record<string, unknown>;
}

export function parseEnvelope(text: string, profile: string): StorageEnvelope {
  const value = parseJsonRecord(text);
  if (value.version !== DATABASE_PROFILE_VERSION) {
    throw new ProfileStorageError('newer_profile', 'This build cannot read the profile storage version; use the matching build or restore.');
  }
  const storage = value.storage as Partial<StorageAddress> | null;
  const chat = value.chat as Partial<ChatState> | null;
  if (!storage || storage.engine !== 'sqlite' || storage.protocol !== 1
    || typeof storage.database !== 'string' || path.basename(storage.database) !== storage.database
    || storageNameIdentity(storage.database) !== storageNameIdentity(path.basename(databasePath(profile)))
    || typeof storage.installationId !== 'string' || !UUID.test(storage.installationId)
    || typeof storage.revision !== 'string' || !UUID.test(storage.revision)
    || !chat || !Array.isArray(chat.channels) || chat.channels.length !== 0
    || !Array.isArray(chat.parallelChatGroups) || chat.parallelChatGroups.length !== 0
    || !Array.isArray(chat.cats) || !value.ownerProfile
    || CORE_ARRAYS.some(key => !Array.isArray(value[key]))) {
    throw new ProfileStorageError('unrecognized_profile', 'The database profile envelope is invalid; no state was reset.');
  }
  normalizeOwnerLifecycle(value.ownerLifecycle);
  return value as unknown as StorageEnvelope;
}

export function envelopeCore(envelope: StorageEnvelope): CatsCoreState {
  const { chat: _chat, storage: _storage, version: _version, ...core } = envelope;
  return { ...core, version: CATS_CORE_STATE_VERSION };
}

export function makeEnvelope(snapshot: PersistedChatSnapshot, profile: string,
  installationId: string, revision = randomUUID()): StorageEnvelope {
  if (snapshot.version !== CATS_CORE_STATE_VERSION) {
    throw new ProfileStorageError('newer_profile', 'The in-memory Core state version is unsupported.');
  }
  return {
    ...snapshot,
    version: DATABASE_PROFILE_VERSION,
    chat: { ...snapshot.chat, channels: [], parallelChatGroups: [] },
    storage: { engine: 'sqlite', protocol: 1, database: path.basename(databasePath(profile)),
      installationId, revision },
  };
}

export function serializeEnvelope(envelope: StorageEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
