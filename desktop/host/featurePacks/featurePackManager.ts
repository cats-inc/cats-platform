// Feature pack manager: layout, status, resumable download, verify and
// activate, start-time check, remove and startup cleanup (SPEC-145 FR-B1-FR-B10).
//
// Cats Bot vendors this directory verbatim (Bot SPEC-016 FR-A2). This file takes
// the contract's types through `import type` only; the contract's functions, the
// transport, the directories and the clock are passed in (FR-B9). Errors from
// the contract are read by their `stage` and `code` fields, never `instanceof`.

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  statfs,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type {
  FeaturePackContract,
  FeaturePackLicense,
  FeaturePackLockEntry,
  FeaturePackManifest,
  FeaturePackStage,
} from './featurePackContract.js';

/** FR-B2. src/shared/featurePackBridge.ts repeats this list for the renderer. */
export const FEATURE_PACK_STATUSES = [
  'not_installed',
  'downloading',
  'paused',
  'verifying',
  'installed',
  'update_available',
  'update_required',
  'damaged',
  'unsupported',
] as const;

export type FeaturePackStatus = (typeof FEATURE_PACK_STATUSES)[number];

export type FeaturePackPauseReason = 'owner' | 'network' | 'quit';

export interface FeaturePackUnsupported {
  reason: 'glibc' | 'prerequisite';
  /** The required glibc version, or the missing library's file name. */
  detail: string;
}

export interface FeaturePackSnapshot {
  id: string;
  status: FeaturePackStatus;
  /** The lock's version, which Download installs. */
  version: string;
  /** The version `active.json` names, if it is readable. */
  activeVersion: string | null;
  /**
   * Whether the start-time check passes (FR-B5). This, not `status`, decides
   * dictation: an older usable version keeps dictating while an update is
   * downloading or paused.
   */
  usable: boolean;
  downloadSize: number;
  unpackedSize: number;
  /** Bytes of the lock's archive received so far, while downloading or paused. */
  receivedBytes: number | null;
  pauseReason: FeaturePackPauseReason | null;
  unsupported: FeaturePackUnsupported | null;
  /** The usable active version's files on disk, in bytes. */
  installedSize: number | null;
  /** The usable active version's manifest languages (SPEC-145 FR-C5). */
  languages: string[];
  licenses: FeaturePackLicense[];
  /** The download's host name, for the consent text (FR-C2). */
  sourceHost: string;
}

export interface FeaturePackFailure {
  stage: FeaturePackStage;
  code: string;
  message: string;
}

export interface FeaturePackChange {
  snapshot: FeaturePackSnapshot;
  /** Set when an operation failed, for the Settings toast (FR-C2). */
  failure: FeaturePackFailure | null;
}

export interface FeaturePackTransportRequest {
  url: string;
  /** Lower-case header names. */
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface FeaturePackTransportResponse {
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
}

/**
 * The product's HTTP client (FR-B3). It must not follow redirects: a 3xx comes
 * back with its `location` header so the manager can refuse non-HTTPS targets.
 * Aborting `signal` ends the request and its body.
 */
export interface FeaturePackTransport {
  request(request: FeaturePackTransportRequest): Promise<FeaturePackTransportResponse>;
}

export interface FeaturePackSystem {
  /** The running glibc version, such as `2.39`; null without glibc. */
  glibcVersion(): string | null;
  /** Whether the loader knows `name` for `arch`; null when that cannot be decided. */
  hasLibrary(name: string, arch: string): Promise<boolean | null>;
  /** Free bytes on the filesystem holding `path`; null when unknown. */
  freeBytes(path: string): Promise<number | null>;
}

export interface FeaturePackClock {
  now(): number;
}

export interface FeaturePackLogRecord {
  operation: 'startup' | 'download' | 'install' | 'check' | 'remove';
  id: string;
  version: string;
  outcome: 'started' | 'resumed' | 'succeeded' | 'paused' | 'cancelled' | 'failed' | 'cleaned';
  stage?: FeaturePackStage;
  code?: string;
  detail?: string;
}

/** The FR-B4 steps a crash can fall between. */
export type FeaturePackInstallStep = 'extracted' | 'renamed' | 'activated' | 'archive_removed';

export interface FeaturePackManagerOptions {
  /** `<platformDir>/feature-packs` (FR-B1). */
  root: string;
  /** The lock entries for this machine's OS and architecture. */
  entries: readonly FeaturePackLockEntry[];
  contract: FeaturePackContract;
  transport: FeaturePackTransport;
  system: FeaturePackSystem;
  clock?: FeaturePackClock;
  log?: (record: FeaturePackLogRecord) => void;
  /** Bytes between fsynced checkpoints of a partial download; default 4 MiB. */
  checkpointBytes?: number;
  /** How long Remove waits for revoked helpers to exit; default 5 s. */
  releaseTimeoutMs?: number;
  /**
   * Awaited after each FR-B4 step. Tests make it never return, which stops the
   * install the way a crash would: no cleanup runs.
   */
  onInstallStep?: (step: FeaturePackInstallStep) => Promise<void>;
}

/** A started helper's hold on one installed version (FR-B4, FR-B6). */
export interface FeaturePackHelperLease {
  id: string;
  version: string;
  directory: string;
  entryPath: string;
  languages: string[];
  /** Call when the helper has exited. */
  release(): void;
}

/** What a failure does to the partial download. */
type Disposition = 'pause' | 'discard' | 'keep';

export class FeaturePackManagerError extends Error {
  readonly stage: FeaturePackStage;
  readonly code: string;
  readonly disposition: Disposition;

  constructor(stage: FeaturePackStage, code: string, message: string, disposition: Disposition) {
    super(message);
    this.name = 'FeaturePackManagerError';
    this.stage = stage;
    this.code = code;
    this.disposition = disposition;
  }
}

interface Transfer {
  entry: FeaturePackLockEntry;
  state: 'downloading' | 'verifying';
  received: number;
  lastProgress: number;
  controller: AbortController;
  stop: 'owner' | 'quit' | 'cancel' | null;
  done: Promise<void>;
}

interface PausedDownload {
  reason: FeaturePackPauseReason;
  received: number;
}

interface InstalledState {
  kind: 'none' | 'usable' | 'unusable' | 'damaged';
  activeVersion: string | null;
  directory: string | null;
  manifest: FeaturePackManifest | null;
}

interface LeaseRecord {
  onRevoke: (() => void) | undefined;
  released: boolean;
  resolveReleased: () => void;
  whenReleased: Promise<void>;
}

const STAGING_DIRECTORY = '.staging';
const ACTIVE_FILE = 'active.json';
const RECEIPT_FILE = '.receipt.json';
const MANIFEST_FILE = 'feature-pack.json';
const DEFAULT_CHECKPOINT_BYTES = 4 * 1024 * 1024;
const DEFAULT_RELEASE_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const NO_INSTALL: InstalledState = {
  kind: 'none',
  activeVersion: null,
  directory: null,
  manifest: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

/** A contract or manager failure, read by its fields (FR-B9). */
function stagedFailure(error: unknown): FeaturePackFailure | null {
  if (isRecord(error) && typeof error.stage === 'string' && typeof error.code === 'string') {
    return {
      stage: error.stage as FeaturePackStage,
      code: error.code,
      message: describeError(error),
    };
  }
  return null;
}

function isSafeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
    && value <= maximum;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') {
      return undefined;
    }
    return null;
  }
}

async function fileSize(file: string): Promise<number | null> {
  try {
    const stats = await lstat(file);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  // Persists renames on POSIX. Windows cannot open a directory this way.
  let handle: FileHandle | undefined;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch {
    // Best effort.
  } finally {
    await handle?.close();
  }
}

async function writeJsonAtomically(target: string, value: unknown): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644, flush: true });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  await syncDirectory(dirname(target));
}

async function writeAll(handle: FileHandle, chunk: Uint8Array, position: number): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(
      chunk,
      offset,
      chunk.length - offset,
      position + offset,
    );
    offset += bytesWritten;
  }
}

/**
 * Runs a local file operation of a download. Its failure is the disk's, not the
 * network's, so it keeps the partial download instead of pausing for `network`.
 */
async function local<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new FeaturePackManagerError('download', 'io_error', describeError(error), 'keep');
  }
}

function parseContentRange(value: string | undefined): {
  start: number;
  end: number;
  total: number;
} | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(value?.trim() ?? '');
  if (!match) {
    return null;
  }
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

function compareDottedNumbers(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }
  return 0;
}

const LOADER_ARCH_TAGS: Record<string, string> = { x64: 'x86-64', arm64: 'AArch64' };

/** `ldconfig -p`, as library name to the loader's tags, such as `libc6,x86-64`. */
async function readLoaderCache(): Promise<Map<string, string[]> | null> {
  for (const command of ['/sbin/ldconfig', '/usr/sbin/ldconfig', 'ldconfig']) {
    const output = await new Promise<string | null>((resolve) => {
      const options = { timeout: 5_000, maxBuffer: 16 * 1024 * 1024 };
      execFile(command, ['-p'], options, (error, stdout) => {
        resolve(error ? null : stdout);
      });
    });
    if (output === null) {
      continue;
    }
    const cache = new Map<string, string[]>();
    for (const line of output.split('\n')) {
      const match = /^\s+(\S+)\s+\(([^)]*)\)\s+=>/u.exec(line);
      if (match?.[1] && match[2] !== undefined) {
        cache.set(match[1], [...(cache.get(match[1]) ?? []), match[2]]);
      }
    }
    return cache;
  }
  return null;
}

/**
 * The default system probe for Linux: glibc from Node's report header, libraries
 * from the loader cache, free space from `statfs`. A library counts as missing
 * only when the cache also lists this architecture's `libc.so.6`; otherwise the
 * check cannot decide, which counts as satisfied (FR-B2).
 */
export function createFeaturePackSystemProbe(): FeaturePackSystem {
  let glibc: string | null | undefined;
  return {
    glibcVersion() {
      if (glibc === undefined) {
        let value: unknown;
        try {
          const report = process.report?.getReport() as {
            header?: { glibcVersionRuntime?: unknown };
          } | undefined;
          value = report?.header?.glibcVersionRuntime;
        } catch {
          value = undefined;
        }
        glibc = typeof value === 'string' && /^\d+\.\d+/u.test(value) ? value : null;
      }
      return glibc;
    },
    async hasLibrary(name, arch) {
      const tag = LOADER_ARCH_TAGS[arch];
      const cache = tag ? await readLoaderCache() : null;
      const matches = (library: string) => (cache?.get(library) ?? [])
        .some((tags) => tag !== undefined && tags.split(',').includes(tag));
      if (!cache || !matches('libc.so.6')) {
        return null;
      }
      return matches(name);
    },
    async freeBytes(path) {
      try {
        const stats = await statfs(path);
        return stats.bavail * stats.bsize;
      } catch {
        return null;
      }
    },
  };
}

export class FeaturePackManager {
  private readonly root: string;
  private readonly stagingDirectory: string;
  private readonly entries: Map<string, FeaturePackLockEntry>;
  private readonly contract: FeaturePackContract;
  private readonly transport: FeaturePackTransport;
  private readonly system: FeaturePackSystem;
  private readonly clock: FeaturePackClock;
  private readonly log: (record: FeaturePackLogRecord) => void;
  private readonly checkpointBytes: number;
  private readonly releaseTimeoutMs: number;
  private readonly onInstallStep: (step: FeaturePackInstallStep) => Promise<void>;
  private readonly listeners = new Set<(change: FeaturePackChange) => void>();
  private readonly transfers = new Map<string, Transfer>();
  private readonly paused = new Map<string, PausedDownload>();
  private readonly installed = new Map<string, InstalledState>();
  private readonly support = new Map<string, FeaturePackUnsupported | null>();
  /** Directories that failed Check files this session (FR-C2). */
  private readonly damaged = new Set<string>();
  private readonly leases = new Map<string, Set<LeaseRecord>>();
  /** Superseded version directories, deleted once no helper holds them. */
  private readonly retired = new Map<string, string>();
  private initialized = false;

  constructor(options: FeaturePackManagerOptions) {
    this.root = options.root;
    this.stagingDirectory = join(options.root, STAGING_DIRECTORY);
    this.entries = new Map(options.entries.map((entry) => [entry.id, entry]));
    this.contract = options.contract;
    this.transport = options.transport;
    this.system = options.system;
    this.clock = options.clock ?? { now: () => Date.now() };
    this.log = options.log ?? (() => undefined);
    this.checkpointBytes = options.checkpointBytes ?? DEFAULT_CHECKPOINT_BYTES;
    this.releaseTimeoutMs = options.releaseTimeoutMs ?? DEFAULT_RELEASE_TIMEOUT_MS;
    this.onInstallStep = options.onInstallStep ?? (async () => undefined);
  }

  /**
   * Creates the layout and runs the startup cleanup (FR-B1, FR-B7): a partial
   * download that matches the lock is kept and reported as paused (`quit`),
   * unless that version is already active and usable. Everything else in
   * `.staging/` is deleted, and so is any version directory that is neither
   * active nor the lock's version.
   */
  async initialize(): Promise<void> {
    await mkdir(this.stagingDirectory, { recursive: true, mode: 0o700 });
    const keep = new Set<string>();
    for (const entry of this.entries.values()) {
      this.support.set(entry.id, await this.checkSupport(entry));
      const installed = await this.inspectInstalled(entry);
      this.installed.set(entry.id, installed);
      const sidecar = await this.readSidecar(entry);
      const partSize = await fileSize(this.partPath(entry));
      const alreadyActive = installed.kind === 'usable'
        && installed.activeVersion === entry.version;
      if (sidecar !== null && partSize !== null && !alreadyActive) {
        keep.add(this.contract.archiveName(entry));
        this.paused.set(entry.id, {
          reason: 'quit',
          received: Math.min(sidecar.received, partSize),
        });
      }
    }
    const kept = new Set(
      [...keep].flatMap((archive) => [`${archive}.part`, `${archive}.part.json`]),
    );
    for (const name of await readdir(this.stagingDirectory)) {
      if (!kept.has(name)) {
        await rm(join(this.stagingDirectory, name), { recursive: true, force: true });
        this.log({ operation: 'startup', id: '-', version: '-', outcome: 'cleaned', detail: name });
      }
    }
    for (const entry of this.entries.values()) {
      await this.cleanVersionDirectories(entry);
    }
    this.initialized = true;
  }

  /** Every pack for this machine, re-read from disk (FR-C4 `list`). */
  async list(): Promise<FeaturePackSnapshot[]> {
    this.assertInitialized();
    const snapshots: FeaturePackSnapshot[] = [];
    for (const entry of this.entries.values()) {
      snapshots.push(await this.refresh(entry));
    }
    return snapshots;
  }

  /** One pack, re-read from disk (FR-C4 `get`). */
  async get(id: string): Promise<FeaturePackSnapshot> {
    this.assertInitialized();
    return this.refresh(this.requireEntry(id));
  }

  onChange(listener: (change: FeaturePackChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Downloads, or resumes, the lock's archive and installs it (FR-B3, FR-B4).
   * One download runs per id; a second call returns the first one's promise.
   * It resolves when the pack is installed or the owner paused or cancelled it,
   * and rejects on any other stop, which also reaches `onChange` as a failure.
   */
  download(id: string): Promise<void> {
    this.assertInitialized();
    const entry = this.requireEntry(id);
    const running = this.transfers.get(id);
    if (running) {
      return running.done;
    }
    const previous = this.paused.get(id);
    const transfer: Transfer = {
      entry,
      state: 'downloading',
      received: previous?.received ?? 0,
      lastProgress: previous?.received ?? 0,
      controller: new AbortController(),
      stop: null,
      done: Promise.resolve(),
    };
    this.transfers.set(id, transfer);
    this.paused.delete(id);
    transfer.done = this.runTransfer(transfer, previous);
    this.emit(id, null);
    return transfer.done;
  }

  /** Pauses a running download or verification with reason `owner`. */
  async pause(id: string): Promise<void> {
    await this.stopTransfer(this.requireEntry(id).id, 'owner');
  }

  /** Resume is a download that keeps the partial file (FR-B3). */
  resume(id: string): Promise<void> {
    return this.download(id);
  }

  /** Cancel while running, or Discard while paused: deletes the partial download. */
  async cancel(id: string): Promise<void> {
    const entry = this.requireEntry(id);
    if (this.transfers.has(id)) {
      await this.stopTransfer(id, 'cancel');
      return;
    }
    await this.discardPartial(entry);
    this.paused.delete(id);
    this.log({ operation: 'download', id, version: entry.version, outcome: 'cancelled' });
    this.emit(id, null);
  }

  /** Pauses every running download with reason `quit`, for Desktop shutdown. */
  async shutdown(): Promise<void> {
    await Promise.all([...this.transfers.keys()].map((id) => this.stopTransfer(id, 'quit')));
  }

  /**
   * Check files: hashes every installed file against the manifest. A mismatch
   * marks the version damaged for this session (FR-C2).
   */
  async check(id: string): Promise<FeaturePackSnapshot> {
    this.assertInitialized();
    const entry = this.requireEntry(id);
    this.assertIdle(id);
    const installed = await this.inspectInstalled(entry);
    const version = installed.activeVersion ?? entry.version;
    let failure: FeaturePackFailure | null = null;
    if (!installed.directory) {
      failure = { stage: 'manifest', code: 'not_installed', message: `${id} is not installed` };
    } else if (!installed.manifest) {
      failure = {
        stage: 'manifest',
        code: 'damaged',
        message: `${id} failed its start-time check`,
      };
    } else {
      for (const file of installed.manifest.files) {
        const hash = createHash('sha256');
        const path = this.filePath(installed.directory, file.path);
        try {
          for await (const chunk of createReadStream(path)) {
            hash.update(chunk as Buffer);
          }
        } catch (error) {
          failure = { stage: 'extract', code: 'file_missing', message: describeError(error) };
          break;
        }
        if (hash.digest('hex') !== file.sha256) {
          failure = {
            stage: 'extract',
            code: 'file_hash_mismatch',
            message: `${file.path} does not have its manifest sha256`,
          };
          break;
        }
      }
      if (failure) {
        this.damaged.add(installed.directory);
      }
    }
    this.log({
      operation: 'check',
      id,
      version,
      outcome: failure ? 'failed' : 'succeeded',
      ...(failure ? { stage: failure.stage, code: failure.code } : {}),
    });
    const snapshot = await this.refresh(entry);
    this.emit(id, failure);
    return snapshot;
  }

  /**
   * Remove (FR-B6): revokes every helper started from the pack, deletes
   * `active.json`, then only the receipt's paths and the emptied directories.
   */
  async remove(id: string): Promise<void> {
    this.assertInitialized();
    const entry = this.requireEntry(id);
    this.assertIdle(id);
    const installed = await this.inspectInstalled(entry);
    await this.revokeLeases(this.packDirectory(id));
    await rm(this.activePath(id), { force: true });
    if (installed.directory) {
      await this.removeReceiptPaths(entry, installed.directory);
      this.damaged.delete(installed.directory);
    }
    await this.collectRetired();
    this.log({
      operation: 'remove',
      id,
      version: installed.activeVersion ?? entry.version,
      outcome: 'succeeded',
    });
    await this.refresh(entry);
    this.emit(id, null);
  }

  /**
   * The start-time check before a helper starts (FR-B5). Returns null when the
   * pack cannot dictate, which the voice path reports as `pack_required`.
   * `onRevoke` is called when Remove needs the helper to stop.
   */
  async acquireHelper(id: string, onRevoke?: () => void): Promise<FeaturePackHelperLease | null> {
    this.assertInitialized();
    const entry = this.entries.get(id);
    if (!entry || this.support.get(id)) {
      return null;
    }
    const installed = await this.inspectInstalled(entry);
    this.installed.set(id, installed);
    const { directory, manifest, activeVersion } = installed;
    if (installed.kind !== 'usable' || !directory || !manifest || !activeVersion) {
      return null;
    }
    let resolveReleased = () => undefined as void;
    const whenReleased = new Promise<void>((resolve) => {
      resolveReleased = resolve;
    });
    const record: LeaseRecord = { onRevoke, released: false, resolveReleased, whenReleased };
    const records = this.leases.get(directory) ?? new Set<LeaseRecord>();
    records.add(record);
    this.leases.set(directory, records);
    return {
      id,
      version: activeVersion,
      directory,
      entryPath: this.filePath(directory, manifest.entry),
      languages: [...manifest.languages],
      release: () => {
        this.releaseLease(directory, record);
      },
    };
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('FeaturePackManager.initialize() has not completed');
    }
  }

  private assertIdle(id: string): void {
    if (this.transfers.has(id)) {
      throw new FeaturePackManagerError(
        'download',
        'busy',
        `${id} is downloading; pause or cancel it first`,
        'keep',
      );
    }
  }

  private requireEntry(id: string): FeaturePackLockEntry {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new FeaturePackManagerError(
        'download',
        'unknown_pack',
        `${id} is not in the lock`,
        'keep',
      );
    }
    return entry;
  }

  private packDirectory(id: string): string {
    return join(this.root, id);
  }

  private activePath(id: string): string {
    return join(this.packDirectory(id), ACTIVE_FILE);
  }

  private versionDirectory(entry: FeaturePackLockEntry, version: string): string {
    return join(this.packDirectory(entry.id), `${version}-${entry.os}-${entry.arch}`);
  }

  private partPath(entry: FeaturePackLockEntry): string {
    return join(this.stagingDirectory, `${this.contract.archiveName(entry)}.part`);
  }

  private sidecarPath(entry: FeaturePackLockEntry): string {
    return `${this.partPath(entry)}.json`;
  }

  private filePath(directory: string, relativePath: string): string {
    return join(directory, ...relativePath.split('/'));
  }

  private snapshot(entry: FeaturePackLockEntry): FeaturePackSnapshot {
    const unsupported = this.support.get(entry.id) ?? null;
    const transfer = this.transfers.get(entry.id);
    const paused = this.paused.get(entry.id);
    const installed = this.installed.get(entry.id) ?? NO_INSTALL;
    let status: FeaturePackStatus;
    if (unsupported) {
      status = 'unsupported';
    } else if (transfer) {
      status = transfer.state;
    } else if (paused) {
      status = 'paused';
    } else if (installed.kind === 'none') {
      status = 'not_installed';
    } else if (installed.kind === 'damaged') {
      status = 'damaged';
    } else if (installed.kind === 'unusable') {
      status = 'update_required';
    } else {
      status = installed.activeVersion === entry.version ? 'installed' : 'update_available';
    }
    const usable = installed.kind === 'usable' && !unsupported;
    return {
      id: entry.id,
      status,
      version: entry.version,
      activeVersion: installed.activeVersion,
      usable,
      downloadSize: entry.size,
      unpackedSize: entry.unpackedSize,
      receivedBytes: transfer?.received ?? paused?.received ?? null,
      pauseReason: transfer ? null : paused?.reason ?? null,
      unsupported,
      installedSize: usable && installed.manifest
        ? installed.manifest.files.reduce((total, file) => total + file.size, 0)
        : null,
      languages: usable && installed.manifest ? [...installed.manifest.languages] : [],
      licenses: entry.licenses.map((license) => ({ ...license })),
      sourceHost: new URL(entry.url).host,
    };
  }

  private emit(id: string, failure: FeaturePackFailure | null): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    const change: FeaturePackChange = { snapshot: this.snapshot(entry), failure };
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch {
        // A listener's failure must not stop the operation.
      }
    }
  }

  private async refresh(entry: FeaturePackLockEntry): Promise<FeaturePackSnapshot> {
    this.support.set(entry.id, await this.checkSupport(entry));
    if (!this.transfers.has(entry.id)) {
      this.installed.set(entry.id, await this.inspectInstalled(entry));
    }
    return this.snapshot(entry);
  }

  private async checkSupport(entry: FeaturePackLockEntry): Promise<FeaturePackUnsupported | null> {
    const glibc = this.system.glibcVersion();
    if (glibc === null || compareDottedNumbers(glibc, entry.minGlibc) < 0) {
      return { reason: 'glibc', detail: entry.minGlibc };
    }
    for (const library of entry.prerequisites) {
      if (await this.system.hasLibrary(library, entry.arch) === false) {
        return { reason: 'prerequisite', detail: library };
      }
    }
    return null;
  }

  /**
   * Reads `active.json`, the receipt and the installed manifest, which are
   * validated before any path is built from them, and checks every manifest
   * file's size (FR-B5).
   */
  private async inspectInstalled(entry: FeaturePackLockEntry): Promise<InstalledState> {
    const pointer = await readJson(this.activePath(entry.id));
    if (pointer === undefined) {
      return NO_INSTALL;
    }
    const damaged: InstalledState = {
      kind: 'damaged',
      activeVersion: null,
      directory: null,
      manifest: null,
    };
    if (
      !isRecord(pointer)
      || pointer.schemaVersion !== 1
      || typeof pointer.version !== 'string'
      || !this.contract.isVersion(pointer.version)
      || pointer.os !== entry.os
      || pointer.arch !== entry.arch
    ) {
      return damaged;
    }
    const activeVersion = pointer.version;
    const directory = this.versionDirectory(entry, activeVersion);
    const withVersion: InstalledState = { ...damaged, activeVersion, directory };
    if (!await this.readReceipt(entry, directory) || this.damaged.has(directory)) {
      return withVersion;
    }
    let manifest: FeaturePackManifest;
    try {
      manifest = this.contract.parseManifest(await readJson(join(directory, MANIFEST_FILE)));
    } catch {
      return withVersion;
    }
    if (
      manifest.id !== entry.id
      || manifest.version !== activeVersion
      || manifest.os !== entry.os
      || manifest.arch !== entry.arch
    ) {
      return withVersion;
    }
    for (const file of manifest.files) {
      if (await fileSize(this.filePath(directory, file.path)) !== file.size) {
        return withVersion;
      }
    }
    const usable = this.contract.compareVersions(activeVersion, entry.minUsableVersion) >= 0
      && manifest.helperProtocol === entry.helperProtocol;
    return { kind: usable ? 'usable' : 'unusable', activeVersion, directory, manifest };
  }

  private async readReceipt(
    entry: FeaturePackLockEntry,
    directory: string,
  ): Promise<{ files: string[] } | null> {
    const receipt = await readJson(join(directory, RECEIPT_FILE));
    if (
      !isRecord(receipt)
      || receipt.schemaVersion !== 1
      || receipt.id !== entry.id
      || !Array.isArray(receipt.files)
      || !receipt.files.every((file) => typeof file === 'string' && this.contract.isSafePath(file))
    ) {
      return null;
    }
    return { files: receipt.files as string[] };
  }

  private async readSidecar(
    entry: FeaturePackLockEntry,
  ): Promise<{ received: number } | null> {
    const sidecar = await readJson(this.sidecarPath(entry));
    if (
      !isRecord(sidecar)
      || sidecar.schemaVersion !== 1
      || sidecar.url !== entry.url
      || sidecar.size !== entry.size
      || typeof sidecar.sha256 !== 'string'
      || !SHA256_PATTERN.test(sidecar.sha256)
      || sidecar.sha256 !== entry.sha256
      || !isSafeInteger(sidecar.received, 0, entry.size)
    ) {
      return null;
    }
    return { received: sidecar.received };
  }

  private async writeSidecar(entry: FeaturePackLockEntry, received: number): Promise<void> {
    await writeJsonAtomically(this.sidecarPath(entry), {
      schemaVersion: 1,
      url: entry.url,
      size: entry.size,
      sha256: entry.sha256,
      received,
    });
  }

  private async discardPartial(entry: FeaturePackLockEntry): Promise<void> {
    await rm(this.partPath(entry), { force: true });
    await rm(this.sidecarPath(entry), { force: true });
  }

  private async cleanVersionDirectories(entry: FeaturePackLockEntry): Promise<void> {
    const packDirectory = this.packDirectory(entry.id);
    let names: string[];
    try {
      names = await readdir(packDirectory);
    } catch {
      return;
    }
    const installed = this.installed.get(entry.id) ?? NO_INSTALL;
    const keep = new Set([
      ACTIVE_FILE,
      `${entry.version}-${entry.os}-${entry.arch}`,
      ...(installed.directory ? [installed.directory.slice(packDirectory.length + 1)] : []),
    ]);
    for (const name of names) {
      if (!keep.has(name)) {
        await rm(join(packDirectory, name), { recursive: true, force: true });
        this.log({
          operation: 'startup',
          id: entry.id,
          version: entry.version,
          outcome: 'cleaned',
          detail: name,
        });
      }
    }
  }

  private async stopTransfer(id: string, stop: 'owner' | 'quit' | 'cancel'): Promise<void> {
    const transfer = this.transfers.get(id);
    if (!transfer) {
      return;
    }
    transfer.stop = stop;
    transfer.controller.abort(new Error(`stopped: ${stop}`));
    await transfer.done.catch(() => undefined);
  }

  private async runTransfer(
    transfer: Transfer,
    previous: PausedDownload | undefined,
  ): Promise<void> {
    const { entry } = transfer;
    const resumed = previous !== undefined;
    try {
      const unsupported = await this.checkSupport(entry);
      this.support.set(entry.id, unsupported);
      if (unsupported) {
        throw new FeaturePackManagerError(
          'download',
          'unsupported',
          `${entry.id} is unsupported on this system (${unsupported.reason})`,
          'keep',
        );
      }
      // The space check reads the partial download without changing it, so a
      // refusal leaves everything as it was.
      const sidecar = await this.readSidecar(entry);
      const partSize = await fileSize(this.partPath(entry));
      const existing = sidecar !== null && partSize !== null
        ? Math.min(sidecar.received, partSize)
        : 0;
      const needed = entry.size - existing + entry.unpackedSize;
      const free = await this.system.freeBytes(this.stagingDirectory);
      if (free !== null && free < needed) {
        throw new FeaturePackManagerError(
          'space',
          'insufficient_space',
          `${needed} bytes are needed and ${free} are free`,
          'keep',
        );
      }
      transfer.received = await local(async () => {
        await mkdir(this.stagingDirectory, { recursive: true, mode: 0o700 });
        return this.preparePartial(entry);
      });
      transfer.lastProgress = transfer.received;
      this.log({
        operation: 'download',
        id: entry.id,
        version: entry.version,
        outcome: resumed ? 'resumed' : 'started',
        detail: String(transfer.received),
      });
      // A complete partial skips the request: `Range: bytes=<size>-` is a 416.
      if (transfer.received < entry.size) {
        await this.fetchRemaining(transfer);
      }
      transfer.controller.signal.throwIfAborted();
      transfer.state = 'verifying';
      this.emit(entry.id, null);
      await this.install(transfer);
      this.transfers.delete(entry.id);
      this.log({
        operation: 'install',
        id: entry.id,
        version: entry.version,
        outcome: 'succeeded',
      });
      this.emit(entry.id, null);
    } catch (error) {
      await this.settle(transfer, error, previous);
    }
  }

  /** Records where a stopped or failed transfer leaves the partial download. */
  private async settle(
    transfer: Transfer,
    error: unknown,
    previous: PausedDownload | undefined,
  ): Promise<void> {
    const { entry } = transfer;
    const base = { id: entry.id, version: entry.version };
    this.transfers.delete(entry.id);
    if (transfer.stop === 'cancel') {
      await this.discardPartial(entry);
      this.log({ operation: 'download', ...base, outcome: 'cancelled' });
      this.emit(entry.id, null);
      return;
    }
    if (transfer.stop === 'owner' || transfer.stop === 'quit') {
      this.paused.set(entry.id, { reason: transfer.stop, received: transfer.received });
      this.log({ operation: 'download', ...base, outcome: 'paused', code: transfer.stop });
      this.emit(entry.id, null);
      return;
    }
    const staged = stagedFailure(error);
    const failure: FeaturePackFailure = staged
      ?? { stage: 'download', code: 'network', message: describeError(error) };
    const disposition: Disposition = error instanceof FeaturePackManagerError
      ? error.disposition
      : 'pause';
    if (disposition === 'discard') {
      await this.discardPartial(entry);
    } else if (disposition === 'pause') {
      this.paused.set(entry.id, { reason: 'network', received: transfer.received });
    } else if (previous) {
      this.paused.set(entry.id, previous);
    }
    this.log({
      operation: transfer.state === 'verifying' ? 'install' : 'download',
      ...base,
      outcome: disposition === 'pause' ? 'paused' : 'failed',
      stage: failure.stage,
      code: failure.code,
    });
    this.installed.set(entry.id, await this.inspectInstalled(entry));
    this.emit(entry.id, failure);
    throw staged
      ? error
      : new FeaturePackManagerError(failure.stage, failure.code, failure.message, disposition);
  }

  /**
   * Validates the partial download against the lock and its sidecar, and trims
   * it to the bytes the sidecar recorded after an fsync (FR-B3). A sidecar that
   * does not match the lock discards it.
   */
  private async preparePartial(entry: FeaturePackLockEntry): Promise<number> {
    const sidecar = await this.readSidecar(entry);
    const size = await fileSize(this.partPath(entry));
    if (sidecar === null || size === null) {
      await this.discardPartial(entry);
      await writeFile(this.partPath(entry), new Uint8Array(0), { mode: 0o600 });
      await this.writeSidecar(entry, 0);
      return 0;
    }
    const received = Math.min(sidecar.received, size);
    if (size !== received) {
      const handle = await open(this.partPath(entry), 'r+');
      try {
        await handle.truncate(received);
      } finally {
        await handle.close();
      }
    }
    return received;
  }

  private async fetchRemaining(transfer: Transfer): Promise<void> {
    const { entry } = transfer;
    const { response, requestController } = await this.requestArchive(transfer);
    try {
      let offset: number;
      if (response.status === 206 && transfer.received > 0) {
        const range = parseContentRange(response.headers['content-range']);
        if (!range || range.start !== transfer.received || range.total !== entry.size) {
          throw new FeaturePackManagerError(
            'resume',
            'unexpected_range',
            `the server sent ${response.headers['content-range'] ?? 'no range'}`,
            'pause',
          );
        }
        offset = transfer.received;
      } else if (response.status === 200) {
        offset = 0;
      } else {
        throw new FeaturePackManagerError(
          transfer.received > 0 ? 'resume' : 'download',
          'unexpected_response',
          `the server answered HTTP ${response.status}`,
          'pause',
        );
      }
      const length = response.headers['content-length'];
      if (length !== undefined && /^\d+$/u.test(length) && offset + Number(length) > entry.size) {
        throw new FeaturePackManagerError(
          'download',
          'oversize',
          `the server announced ${offset + Number(length)} bytes; the lock says ${entry.size}`,
          'discard',
        );
      }
      await this.writeBody(transfer, response.body, offset);
    } finally {
      requestController.abort();
    }
  }

  /** Follows up to five redirects, HTTPS only (FR-B3). */
  private async requestArchive(transfer: Transfer): Promise<{
    response: FeaturePackTransportResponse;
    requestController: AbortController;
  }> {
    let url = transfer.entry.url;
    for (let redirects = 0; ; redirects += 1) {
      const requestController = new AbortController();
      const signal = AbortSignal.any([transfer.controller.signal, requestController.signal]);
      const headers: Record<string, string> = transfer.received > 0
        ? { range: `bytes=${transfer.received}-` }
        : {};
      const response = await this.transport.request({ url, headers, signal });
      if (!REDIRECT_STATUSES.has(response.status)) {
        return { response, requestController };
      }
      requestController.abort();
      const location = response.headers.location;
      let next: URL | null = null;
      try {
        next = location ? new URL(location, url) : null;
      } catch {
        next = null;
      }
      if (next === null) {
        throw new FeaturePackManagerError(
          'download',
          'bad_redirect',
          'a redirect had no usable location',
          'pause',
        );
      }
      if (next.protocol !== 'https:') {
        throw new FeaturePackManagerError(
          'download',
          'insecure_redirect',
          `refused a redirect to ${next.protocol}//${next.host}`,
          'pause',
        );
      }
      if (redirects >= MAX_REDIRECTS) {
        throw new FeaturePackManagerError(
          'download',
          'too_many_redirects',
          `more than ${MAX_REDIRECTS} redirects`,
          'pause',
        );
      }
      url = next.href;
    }
  }

  /**
   * Writes the body at `offset`. Each checkpoint fsyncs the partial file before
   * the sidecar records it, so the sidecar never counts unsynced bytes.
   */
  private async writeBody(
    transfer: Transfer,
    body: AsyncIterable<Uint8Array>,
    offset: number,
  ): Promise<void> {
    const { entry } = transfer;
    const handle = await local(() => open(this.partPath(entry), offset === 0 ? 'w' : 'r+', 0o600));
    transfer.received = offset;
    let unsynced = 0;
    try {
      for await (const chunk of body) {
        if (transfer.stop) {
          break;
        }
        if (transfer.received + chunk.length > entry.size) {
          throw new FeaturePackManagerError(
            'download',
            'oversize',
            `the server sent more than the lock's ${entry.size} bytes`,
            'discard',
          );
        }
        await local(() => writeAll(handle, chunk, transfer.received));
        transfer.received += chunk.length;
        unsynced += chunk.length;
        if (unsynced >= this.checkpointBytes) {
          await local(async () => {
            await handle.sync();
            await this.writeSidecar(entry, transfer.received);
          });
          unsynced = 0;
        }
        const step = Math.max(256 * 1024, Math.floor(entry.size / 200));
        if (transfer.received - transfer.lastProgress >= step) {
          transfer.lastProgress = transfer.received;
          this.emit(entry.id, null);
        }
      }
      if (!transfer.stop && transfer.received < entry.size) {
        throw new FeaturePackManagerError(
          'download',
          'incomplete',
          `the download ended at ${transfer.received} of ${entry.size} bytes`,
          'pause',
        );
      }
    } finally {
      // A failed final checkpoint leaves the previous one, which is still safe:
      // a resume trims the partial file to it.
      await handle.sync().catch(() => undefined);
      await handle.close().catch(() => undefined);
      await this.writeSidecar(entry, transfer.received).catch(() => undefined);
    }
  }

  /** Verify and activate (FR-B4). No byte from the archive runs before this ends. */
  private async install(transfer: Transfer): Promise<void> {
    const { entry } = transfer;
    const archiveName = this.contract.archiveName(entry);
    const extractDirectory = join(this.stagingDirectory, `${archiveName}.extract-${randomUUID()}`);
    try {
      let manifest: FeaturePackManifest;
      try {
        manifest = await this.contract.verifyArchive(this.partPath(entry), entry, {
          extractTo: extractDirectory,
          signal: transfer.controller.signal,
        });
      } catch (error) {
        const staged = stagedFailure(error);
        if (transfer.stop || !staged) {
          throw transfer.stop || !(error instanceof Error)
            ? error
            : new FeaturePackManagerError('extract', 'io_error', error.message, 'keep');
        }
        // The archive matched or failed the lock's hash; either way, fetching
        // the same bytes again cannot help (FR-B4).
        throw new FeaturePackManagerError(staged.stage, staged.code, staged.message, 'discard');
      }
      await writeJsonAtomically(join(extractDirectory, RECEIPT_FILE), {
        schemaVersion: 1,
        id: entry.id,
        version: entry.version,
        os: entry.os,
        arch: entry.arch,
        installedAt: new Date(this.clock.now()).toISOString(),
        files: [MANIFEST_FILE, ...manifest.files.map((file) => file.path)],
      });
      await syncDirectory(extractDirectory);
      await this.onInstallStep('extracted');
      await this.activate(entry, extractDirectory);
    } catch (error) {
      if (error instanceof FeaturePackManagerError || transfer.stop) {
        throw error;
      }
      throw new FeaturePackManagerError('activate', 'io_error', describeError(error), 'keep');
    } finally {
      await rm(extractDirectory, { recursive: true, force: true });
    }
  }

  private async activate(entry: FeaturePackLockEntry, extractDirectory: string): Promise<void> {
    const packDirectory = this.packDirectory(entry.id);
    const versionDirectory = this.versionDirectory(entry, entry.version);
    await mkdir(packDirectory, { recursive: true, mode: 0o700 });
    const previous = await this.inspectInstalled(entry);
    if (await pathExists(versionDirectory)) {
      if (previous.directory === versionDirectory) {
        // Reinstalling the active version: drop the pointer first, so a crash
        // leaves `not_installed` and a complete partial, never a mixed version.
        await rm(this.activePath(entry.id), { force: true });
        const aside = join(this.stagingDirectory, `${entry.version}.replaced-${randomUUID()}`);
        await rename(versionDirectory, aside);
        await this.retire(versionDirectory, aside);
      } else {
        await rm(versionDirectory, { recursive: true, force: true });
      }
    }
    await rename(extractDirectory, versionDirectory);
    await syncDirectory(packDirectory);
    await this.onInstallStep('renamed');
    await writeJsonAtomically(this.activePath(entry.id), {
      schemaVersion: 1,
      version: entry.version,
      os: entry.os,
      arch: entry.arch,
    });
    await this.onInstallStep('activated');
    await this.discardPartial(entry);
    await this.onInstallStep('archive_removed');
    this.damaged.delete(versionDirectory);
    if (previous.directory && previous.directory !== versionDirectory) {
      await this.retire(previous.directory, previous.directory);
    }
    this.installed.set(entry.id, await this.inspectInstalled(entry));
  }

  /** Deletes a superseded version now, or when its last helper releases it. */
  private async retire(directory: string, location: string): Promise<void> {
    if (this.leases.get(directory)?.size) {
      this.retired.set(directory, location);
      return;
    }
    await rm(location, { recursive: true, force: true });
  }

  private releaseLease(directory: string, record: LeaseRecord): void {
    if (record.released) {
      return;
    }
    record.released = true;
    const records = this.leases.get(directory);
    records?.delete(record);
    if (records && records.size === 0) {
      this.leases.delete(directory);
      const location = this.retired.get(directory);
      if (location !== undefined) {
        this.retired.delete(directory);
        void rm(location, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    record.resolveReleased();
  }

  private async revokeLeases(packDirectory: string): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const [directory, records] of this.leases) {
      if (!directory.startsWith(`${packDirectory}${sep}`)) {
        continue;
      }
      for (const record of records) {
        waits.push(record.whenReleased);
        try {
          record.onRevoke?.();
        } catch {
          // The helper is stopped either way once Remove finishes.
        }
      }
    }
    if (waits.length > 0) {
      const timer = new AbortController();
      await Promise.race([
        Promise.all(waits),
        delay(this.releaseTimeoutMs, undefined, { signal: timer.signal }).catch(() => undefined),
      ]);
      timer.abort();
    }
  }

  private async collectRetired(): Promise<void> {
    for (const [directory, location] of [...this.retired]) {
      if (!this.leases.get(directory)?.size) {
        this.retired.delete(directory);
        await rm(location, { recursive: true, force: true });
      }
    }
  }

  /**
   * Deletes the receipt's paths and then the directories they emptied. Anything
   * else in the version directory stays (FR-B6).
   */
  private async removeReceiptPaths(entry: FeaturePackLockEntry, directory: string): Promise<void> {
    const receipt = await this.readReceipt(entry, directory);
    if (!receipt) {
      return;
    }
    const parents = new Set<string>();
    for (const file of receipt.files) {
      await rm(this.filePath(directory, file), { force: true });
      const segments = file.split('/');
      for (let length = 1; length < segments.length; length += 1) {
        parents.add(segments.slice(0, length).join('/'));
      }
    }
    await rm(join(directory, RECEIPT_FILE), { force: true });
    const deepestFirst = [...parents]
      .sort((left, right) => right.split('/').length - left.split('/').length)
      .map((path) => this.filePath(directory, path));
    for (const parent of [...deepestFirst, directory]) {
      await rmdir(parent).catch(() => undefined);
    }
  }
}
