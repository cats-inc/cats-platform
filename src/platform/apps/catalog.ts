// Signed official App catalog consumer (SPEC-120 FR-09). The envelope is verified before
// any payload field is trusted; the last verified envelope is cached for offline browsing,
// and the highest verified revision is kept so an older catalog cannot be replayed.
import { createPublicKey, verify } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_PACKAGE_BYTES } from '#cats-app-package';
import { AppCatalogError, fetchAppCatalogBytes, isAllowedAppCatalogSource } from './catalogFetch.js';
import { APP_CATALOG_TRUSTED_KEYS, APP_CATALOG_URL, type AppCatalogTrustedKey } from './catalogTrust.js';
import { resolveCatsAppStoragePathsFromChatState } from './paths.js';

export const APP_CATALOG_SCHEMA_VERSION = 1;
export const MAX_APP_CATALOG_PAYLOAD_BYTES = 256 * 1024;
const MAX_ENVELOPE_BYTES = 512 * 1024;
const CATALOG_TIMEOUT_MS = 15_000;
// Below the Desktop App request timeout, so the renderer never reports a failure while the
// server is still finishing an install.
const ARTIFACT_TIMEOUT_MS = 60_000;
/** A cached catalog younger than this is reused without a network request. */
const CATALOG_REUSE_MS = 15 * 60 * 1000;
const MAX_APPS = 64;
const MAX_VERSIONS = 32;
const APP_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface AppCatalogPublisher { name: string; homepage?: string }

export interface AppCatalogVersion {
  version: string;
  artifact: { url: string; size: number; sha256: string };
  compatibility: { catsPlatform: string; appSdk: string };
  permissions: string[];
  publisher: AppCatalogPublisher;
  notes: string;
  withdrawn?: { reason: string; at: string };
}

export interface AppCatalogApp {
  id: string;
  displayName: string;
  description: string;
  icon: string | null;
  channels: { stable: string; preview?: string };
  versions: AppCatalogVersion[];
}

export interface AppCatalogPayload {
  schemaVersion: 1;
  revision: number;
  issuedAt: string;
  expiresAt: string;
  publisher: AppCatalogPublisher;
  apps: AppCatalogApp[];
}

export interface AppCatalogEnvelope { algorithm: string; keyId: string; payload: string; signature: string }

export type AppCatalogStatus = 'fresh' | 'cached' | 'expired' | 'unavailable';

export interface AppCatalogSnapshot {
  status: AppCatalogStatus;
  catalog: AppCatalogPayload | null;
  keyId: string | null;
  fetchedAt: string | null;
  /** Why the latest refresh failed, when a cached or no catalog is shown. */
  error?: { code: string; message: string };
}

function invalid(field: string, message: string): never {
  throw new AppCatalogError('catalog_invalid', `${field} ${message}`);
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field, 'must be an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) invalid(field, `must be a string of at most ${max} characters.`);
  return value;
}
function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) invalid(field, 'must be a timestamp.');
  return value;
}
function publisher(value: unknown, field: string): AppCatalogPublisher {
  const input = record(value, field);
  const result: AppCatalogPublisher = { name: text(input.name, `${field}.name`, 200) };
  if (input.homepage !== undefined) {
    if (typeof input.homepage !== 'string' || !input.homepage.startsWith('https://')) invalid(`${field}.homepage`, 'must be an https URL.');
    result.homepage = input.homepage;
  }
  return result;
}

function parseVersion(value: unknown, field: string): AppCatalogVersion {
  const input = record(value, field);
  if (typeof input.version !== 'string' || !VERSION.test(input.version)) invalid(`${field}.version`, 'must be an exact version.');
  const artifact = record(input.artifact, `${field}.artifact`);
  const url = text(artifact.url, `${field}.artifact.url`, 500);
  if (!URL.canParse(url) || !isAllowedAppCatalogSource('artifact', new URL(url))) invalid(`${field}.artifact.url`, 'is not an official release asset.');
  if (!Number.isSafeInteger(artifact.size) || (artifact.size as number) < 1 || (artifact.size as number) > MAX_PACKAGE_BYTES) {
    invalid(`${field}.artifact.size`, `must be 1-${MAX_PACKAGE_BYTES} bytes.`);
  }
  if (typeof artifact.sha256 !== 'string' || !SHA256.test(artifact.sha256)) invalid(`${field}.artifact.sha256`, 'must be a SHA-256.');
  const compatibility = record(input.compatibility, `${field}.compatibility`);
  if (!Array.isArray(input.permissions) || input.permissions.length > 32) invalid(`${field}.permissions`, 'must be a list.');
  const result: AppCatalogVersion = {
    version: input.version,
    artifact: { url, size: artifact.size as number, sha256: artifact.sha256 },
    compatibility: {
      catsPlatform: text(compatibility.catsPlatform, `${field}.compatibility.catsPlatform`, 40),
      appSdk: text(compatibility.appSdk, `${field}.compatibility.appSdk`, 40),
    },
    permissions: input.permissions.map((permission, index) => text(permission, `${field}.permissions[${index}]`, 100)),
    publisher: publisher(input.publisher, `${field}.publisher`),
    notes: text(input.notes, `${field}.notes`, 2000, true),
  };
  if (input.withdrawn !== undefined) {
    const withdrawn = record(input.withdrawn, `${field}.withdrawn`);
    result.withdrawn = { reason: text(withdrawn.reason, `${field}.withdrawn.reason`, 500), at: timestamp(withdrawn.at, `${field}.withdrawn.at`) };
  }
  return result;
}

function parseApp(value: unknown, field: string): AppCatalogApp {
  const input = record(value, field);
  if (typeof input.id !== 'string' || input.id.length > 100 || !APP_ID.test(input.id)) invalid(`${field}.id`, 'is not an App ID.');
  if (!Array.isArray(input.versions) || !input.versions.length || input.versions.length > MAX_VERSIONS) invalid(`${field}.versions`, `must list 1-${MAX_VERSIONS} versions.`);
  const versions = input.versions.map((entry, index) => parseVersion(entry, `${field}.versions[${index}]`));
  if (new Set(versions.map((entry) => entry.version)).size !== versions.length) invalid(`${field}.versions`, 'repeats a version.');
  const channels = record(input.channels, `${field}.channels`);
  const selected = (channel: 'stable' | 'preview') => {
    const version = versions.find((entry) => entry.version === channels[channel]);
    if (!version || version.withdrawn) invalid(`${field}.channels.${channel}`, 'must select a listed, current version.');
    return version.version;
  };
  return {
    id: input.id,
    displayName: text(input.displayName, `${field}.displayName`, 100),
    description: text(input.description, `${field}.description`, 500, true),
    icon: input.icon === null ? null : text(input.icon, `${field}.icon`, 40),
    channels: { stable: selected('stable'), ...(channels.preview !== undefined ? { preview: selected('preview') } : {}) },
    versions,
  };
}

// Schema v1 accepts and drops unknown fields so the producer can add optional data.
export function parseAppCatalogPayload(value: unknown): AppCatalogPayload {
  const input = record(value, 'catalog');
  if (input.schemaVersion !== APP_CATALOG_SCHEMA_VERSION) {
    throw new AppCatalogError('catalog_unsupported', `Unsupported catalog schema ${String(input.schemaVersion)}.`);
  }
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1) invalid('catalog.revision', 'must be a positive integer.');
  const issuedAt = timestamp(input.issuedAt, 'catalog.issuedAt');
  const expiresAt = timestamp(input.expiresAt, 'catalog.expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) invalid('catalog.expiresAt', 'must follow issuedAt.');
  if (!Array.isArray(input.apps) || input.apps.length > MAX_APPS) invalid('catalog.apps', `must list at most ${MAX_APPS} Apps.`);
  const apps = input.apps.map((app, index) => parseApp(app, `catalog.apps[${index}]`));
  if (new Set(apps.map((app) => app.id)).size !== apps.length) invalid('catalog.apps', 'repeats an App ID.');
  return {
    schemaVersion: APP_CATALOG_SCHEMA_VERSION,
    revision: input.revision as number,
    issuedAt,
    expiresAt,
    publisher: publisher(input.publisher, 'catalog.publisher'),
    apps,
  };
}

// Verify the signature over the exact payload bytes before reading any payload field.
export function verifyAppCatalogEnvelope(value: unknown, trustedKeys: readonly AppCatalogTrustedKey[]): AppCatalogPayload {
  const envelope = record(value, 'envelope');
  if (envelope.algorithm !== 'ed25519') throw new AppCatalogError('catalog_untrusted', 'Unsupported catalog signature algorithm.');
  const key = trustedKeys.find((candidate) => candidate.algorithm === 'ed25519' && candidate.keyId === envelope.keyId);
  if (!key) throw new AppCatalogError('catalog_untrusted', 'The catalog is signed by an unknown key.');
  if (typeof envelope.payload !== 'string' || envelope.payload.length > Math.ceil(MAX_APP_CATALOG_PAYLOAD_BYTES / 3) * 4
    || !BASE64.test(envelope.payload) || typeof envelope.signature !== 'string' || !BASE64.test(envelope.signature)) {
    throw new AppCatalogError('catalog_untrusted', 'The catalog envelope is malformed.');
  }
  const payload = Buffer.from(envelope.payload, 'base64');
  const signature = Buffer.from(envelope.signature, 'base64');
  const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.publicKey }, format: 'jwk' });
  if (signature.length !== 64 || !verify(null, payload, publicKey, signature)) {
    throw new AppCatalogError('catalog_untrusted', 'The catalog signature is invalid.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(payload.toString('utf8')); } catch { invalid('catalog', 'is not JSON.'); }
  return parseAppCatalogPayload(parsed);
}

export function isAppCatalogExpired(catalog: AppCatalogPayload, now: Date): boolean {
  return now.getTime() >= Date.parse(catalog.expiresAt);
}

export interface AppCatalogProvenance { version: string; sha256: string; revision: number; keyId: string; installedAt: string }

interface AppCatalogState {
  schemaVersion: 1;
  highestRevision: number;
  envelope: AppCatalogEnvelope | null;
  fetchedAt: string | null;
  installs: Record<string, AppCatalogProvenance>;
}

const EMPTY_STATE: AppCatalogState = { schemaVersion: 1, highestRevision: 0, envelope: null, fetchedAt: null, installs: {} };
const stateQueues = new Map<string, Promise<unknown>>();

export function resolveAppCatalogStatePath(chatStatePath: string): string {
  return path.join(resolveCatsAppStoragePathsFromChatState(chatStatePath).appsDir, 'catalog-state.json');
}

async function readCatalogState(statePath: string): Promise<AppCatalogState> {
  let raw: string;
  try { raw = await readFile(statePath, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_STATE);
    throw error;
  }
  const parsed = JSON.parse(raw) as Partial<AppCatalogState>;
  if (parsed.schemaVersion !== 1 || !Number.isSafeInteger(parsed.highestRevision)) throw new Error('Unsupported App catalog state.');
  return { ...structuredClone(EMPTY_STATE), ...parsed } as AppCatalogState;
}

async function writeCatalogState(statePath: string, state: AppCatalogState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tempPath, statePath);
}

// Catalog refreshes and provenance writes for one profile run one at a time.
function withCatalogState<T>(statePath: string, work: () => Promise<T>): Promise<T> {
  const key = statePath.toLowerCase();
  const pending = (stateQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
  stateQueues.set(key, pending);
  return pending.finally(() => { if (stateQueues.get(key) === pending) stateQueues.delete(key); });
}

export interface AppCatalogClient {
  load(options: { chatStatePath: string; refresh?: boolean }): Promise<AppCatalogSnapshot>;
  downloadArtifact(version: AppCatalogVersion): Promise<Uint8Array>;
  recordInstall(chatStatePath: string, appId: string, provenance: AppCatalogProvenance): Promise<void>;
}

export function createAppCatalogClient(options: {
  url?: string;
  trustedKeys?: readonly AppCatalogTrustedKey[];
  fetch?: typeof fetch;
  now?: () => Date;
} = {}): AppCatalogClient {
  const url = options.url ?? APP_CATALOG_URL;
  const trustedKeys = options.trustedKeys ?? APP_CATALOG_TRUSTED_KEYS;
  const now = options.now ?? (() => new Date());

  function snapshot(status: AppCatalogStatus, state: AppCatalogState, catalog: AppCatalogPayload | null, error?: unknown): AppCatalogSnapshot {
    const effective = catalog && isAppCatalogExpired(catalog, now()) ? 'expired' : status;
    return {
      status: catalog ? effective : 'unavailable',
      catalog,
      keyId: catalog ? state.envelope?.keyId ?? null : null,
      fetchedAt: catalog ? state.fetchedAt : null,
      ...(error ? { error: error instanceof AppCatalogError
        ? { code: error.code, message: error.message }
        : { code: 'catalog_unavailable', message: error instanceof Error ? error.message : String(error) } } : {}),
    };
  }

  return {
    load({ chatStatePath, refresh = false }) {
      const statePath = resolveAppCatalogStatePath(chatStatePath);
      return withCatalogState(statePath, async () => {
        let state = structuredClone(EMPTY_STATE);
        let cached: AppCatalogPayload | null = null;
        try {
          state = await readCatalogState(statePath);
          // The cache is re-verified on every load; its parsed form is never trusted.
          cached = state.envelope ? verifyAppCatalogEnvelope(state.envelope, trustedKeys) : null;
        } catch { cached = null; }
        const fetchedAt = state.fetchedAt ? Date.parse(state.fetchedAt) : Number.NaN;
        if (cached && !refresh && now().getTime() - fetchedAt < CATALOG_REUSE_MS) return snapshot('fresh', state, cached);
        try {
          const bytes = await fetchAppCatalogBytes('catalog', url, { maxBytes: MAX_ENVELOPE_BYTES, timeoutMs: CATALOG_TIMEOUT_MS, fetch: options.fetch });
          let envelope: AppCatalogEnvelope;
          try { envelope = JSON.parse(Buffer.from(bytes).toString('utf8')) as AppCatalogEnvelope; }
          catch { throw new AppCatalogError('catalog_untrusted', 'The catalog envelope is not JSON.'); }
          const catalog = verifyAppCatalogEnvelope(envelope, trustedKeys);
          if (catalog.revision < state.highestRevision) {
            throw new AppCatalogError('catalog_rollback', `Catalog revision ${catalog.revision} is older than verified revision ${state.highestRevision}.`);
          }
          state = { ...state, highestRevision: catalog.revision, envelope, fetchedAt: now().toISOString() };
          await writeCatalogState(statePath, state);
          return snapshot('fresh', state, catalog);
        } catch (error) {
          return snapshot('cached', state, cached, error);
        }
      });
    },

    async downloadArtifact(version) {
      const bytes = await fetchAppCatalogBytes('artifact', version.artifact.url, {
        maxBytes: version.artifact.size, timeoutMs: ARTIFACT_TIMEOUT_MS, fetch: options.fetch,
      });
      if (bytes.length !== version.artifact.size) throw new AppCatalogError('download_rejected', 'The downloaded App does not match the catalog size.');
      return bytes;
    },

    recordInstall(chatStatePath, appId, provenance) {
      const statePath = resolveAppCatalogStatePath(chatStatePath);
      return withCatalogState(statePath, async () => {
        const state = await readCatalogState(statePath);
        await writeCatalogState(statePath, { ...state, installs: { ...state.installs, [appId]: provenance } });
      });
    },
  };
}
