import { mkdir, readFile, readdir, lstat, writeFile, rename, copyFile, unlink, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import type { IngressSecretProtector, IngressSecretPurpose } from '#cats-ingress-secrets';

export interface PlatformIngressSettings {
  schemaVersion: 3; enabled: boolean; autoConnect: boolean;
  provider: 'ngrok' | 'external'; listenPort: number; credentialRef?: string; publicOrigin?: string;
}
interface LegacySettings { schemaVersion: 2; enabled: boolean; provider: 'ngrok' | 'external';
  listenPort: number; authtoken: string; publicOrigin?: string }
interface MigrationJournal { schemaVersion: 1; settings: PlatformIngressSettings; backupRef: string;
  files: { filename: string; digest: string }[] }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,512}$/;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const emptyIngressSettings: PlatformIngressSettings = {
  schemaVersion: 3, enabled: false, autoConnect: false, provider: 'ngrok', listenPort: 0,
};
export function validatePublicOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid public origin.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^[a-z0-9.-]+$/.test(url.hostname) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
    || /^127\./.test(url.hostname) || url.hostname === '0.0.0.0') throw new Error('Invalid public origin.');
  return url.origin;
}
export function validateIngressSettings(value: unknown): PlatformIngressSettings {
  const input = value as Partial<PlatformIngressSettings> | null;
  if (!input || input.schemaVersion !== 3 || typeof input.enabled !== 'boolean'
    || typeof input.autoConnect !== 'boolean' || !['ngrok', 'external'].includes(input.provider ?? '')
    || !Number.isInteger(input.listenPort) || input.listenPort! < 0 || input.listenPort! > 65535
    || ('authtoken' in input) || (input.credentialRef !== undefined && !UUID.test(input.credentialRef))
    || (input.enabled && input.provider === 'ngrok' && !input.credentialRef)
    || (input.enabled && input.provider === 'external' && (!input.publicOrigin || input.listenPort === 0))) {
    throw new Error('Invalid ingress settings.');
  }
  return { schemaVersion: 3, enabled: input.enabled, autoConnect: input.autoConnect,
    provider: input.provider!, listenPort: input.listenPort!,
    ...(input.credentialRef ? { credentialRef: input.credentialRef } : {}),
    ...(input.publicOrigin ? { publicOrigin: validatePublicOrigin(input.publicOrigin) } : {}) };
}
function validateLegacy(value: unknown): LegacySettings {
  const input = value as LegacySettings | null;
  if (!input || input.schemaVersion !== 2 || typeof input.authtoken !== 'string'
    || (input.authtoken && !TOKEN.test(input.authtoken))) throw new Error('Unknown ingress configuration.');
  const { authtoken, ...metadata } = input;
  validateIngressSettings({ ...metadata, schemaVersion: 3, autoConnect: input.enabled,
    credentialRef: authtoken ? randomUUID() : undefined });
  return input;
}
async function boundedRead(filename: string, limit = 8192) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error('Unsafe ingress configuration.');
  return readFile(filename, 'utf8');
}
async function atomicWrite(filename: string, value: unknown) {
  await mkdir(path.dirname(filename), { recursive: true });
  if ((await lstat(path.dirname(filename))).isSymbolicLink()) throw new Error('Unsafe ingress directory.');
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600, flush: true });
    await rename(temporary, filename);
    await syncDirectory(path.dirname(filename));
  } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
async function syncDirectory(directory: string) {
  // Node cannot flush directory handles on Windows. File contents are flushed;
  // NTFS rename/directory power-loss behavior remains an OS boundary, not a tested guarantee.
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

/** Current settings never contain plaintext. Legacy formats are migration input only. */
export class PlatformIngressSettingsStore {
  readonly vaultDirectory: string;
  private readonly journalPath: string;
  constructor(readonly filename: string, readonly legacyDirectory: string,
    private readonly secrets?: IngressSecretProtector) {
    this.vaultDirectory = path.join(path.dirname(filename), 'ingress-secrets');
    this.journalPath = `${filename}.migration.json`;
  }
  private protector() {
    if (!this.secrets) throw new Error('secure_storage_unavailable');
    return this.secrets;
  }
  private async seal(purpose: IngressSecretPurpose, value: string) {
    const ciphertext = await this.protector().seal(purpose, value);
    await mkdir(this.vaultDirectory, { recursive: true });
    if ((await lstat(this.vaultDirectory)).isSymbolicLink()) throw new Error('Unsafe credential directory.');
    const reference = randomUUID();
    await writeFile(path.join(this.vaultDirectory, `${reference}.json`),
      JSON.stringify({ schemaVersion: 1, purpose, ciphertext }), { flag: 'wx', mode: 0o600, flush: true });
    await syncDirectory(this.vaultDirectory);
    if (await this.unseal(reference, purpose) !== value) throw new Error('secure_storage_unavailable');
    return reference;
  }
  private async unseal(reference: string, purpose: IngressSecretPurpose) {
    if (!UUID.test(reference) || (await lstat(this.vaultDirectory)).isSymbolicLink()) throw new Error('Invalid credential reference.');
    const record = JSON.parse(await boundedRead(path.join(this.vaultDirectory, `${reference}.json`), 4 * 1024 * 1024));
    if (record.schemaVersion !== 1 || record.purpose !== purpose || typeof record.ciphertext !== 'string') throw new Error('Invalid protected credential.');
    return this.protector().unseal(purpose, record.ciphertext);
  }
  async credential(settings: PlatformIngressSettings) {
    if (!settings.credentialRef) throw new Error('credential_required');
    const token = await this.unseal(settings.credentialRef, 'credential');
    if (!TOKEN.test(token)) throw new Error('Invalid protected credential.');
    return token;
  }
  async withCredential(settings: PlatformIngressSettings, token?: string): Promise<PlatformIngressSettings> {
    if (token === undefined) return settings;
    if (!TOKEN.test(token)) throw new Error('Invalid ingress credential.');
    return { ...settings, credentialRef: await this.seal('credential', token) };
  }
  async read(): Promise<PlatformIngressSettings | null> {
    try {
      await this.resumeMigration();
      let contents: string;
      try { contents = await boundedRead(this.filename); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      const input = JSON.parse(contents);
      if (input.schemaVersion === 3) return validateIngressSettings(input);
      return await this.upgrade(validateLegacy(input));
    } catch (error) {
      if (error instanceof Error && error.message === 'secure_storage_unavailable') throw error;
      throw new Error('Ingress settings need recovery.');
    }
  }
  async legacy(): Promise<{ appId: string; filename: string; settings: LegacySettings }[]> {
    let files;
    try { files = await readdir(this.legacyDirectory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    if (files.length > 256 || (await lstat(this.legacyDirectory)).isSymbolicLink()) throw new Error('Unsafe ingress configuration.');
    const result = [];
    for (const file of files) {
      if (!/^[a-z][a-z0-9.-]{0,99}\.json$/.test(file.name)) continue;
      const filename = path.join(this.legacyDirectory, file.name);
      const input = JSON.parse(await boundedRead(filename));
      if (input.schemaVersion !== 1) throw new Error('Unknown ingress configuration.');
      const settings = validateLegacy({ schemaVersion: 2, provider: 'ngrok', listenPort: 0,
        enabled: input.enabled, authtoken: input.authtoken, ...(input.url ? { publicOrigin: input.url } : {}) });
      result.push({ appId: file.name.slice(0, -5), filename, settings });
    }
    return result;
  }
  private allowedSource(filename: string) {
    if (path.resolve(filename) === path.resolve(this.filename)) return true;
    if (path.dirname(filename) === path.dirname(this.filename)) {
      const suffix = path.basename(filename).slice(path.basename(this.filename).length);
      return path.basename(filename).startsWith(path.basename(this.filename))
        && /^\.(?:(?:legacy-)?[a-f0-9-]{36}\.bak|[A-Za-z0-9-]{1,80}\.tmp)$/.test(suffix);
    }
    return path.dirname(filename) === this.legacyDirectory && /^[a-z][a-z0-9.-]{0,99}\.json$/.test(path.basename(filename));
  }
  async upgrade(old: LegacySettings): Promise<PlatformIngressSettings> {
    const sources: { filename: string; contents: string }[] = [];
    const add = async (filename: string) => {
      try {
        const contents = await boundedRead(filename);
        if (filename.endsWith('.bak')) {
          const input = JSON.parse(contents);
          if (input.schemaVersion === 3) validateIngressSettings(input);
          else if (input.schemaVersion === 2) validateLegacy(input);
          else if (input.schemaVersion === 1) validateLegacy({ schemaVersion: 2, provider: 'ngrok', listenPort: 0,
            enabled: input.enabled, authtoken: input.authtoken, ...(input.url ? { publicOrigin: input.url } : {}) });
          else throw new Error('Unknown ingress backup schema.');
        }
        sources.push({ filename, contents });
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    };
    await add(this.filename);
    const directory = await readdir(path.dirname(this.filename)).catch(error => {
      if (error.code === 'ENOENT') return []; throw error;
    });
    if (directory.length > 1024) throw new Error('Ingress settings need recovery.');
    for (const name of directory) {
      const filename = path.join(path.dirname(this.filename), name);
      if (filename !== this.filename && this.allowedSource(filename)) await add(filename);
    }
    for (const row of await this.legacy()) await add(row.filename);
    let settings: PlatformIngressSettings = { ...emptyIngressSettings, enabled: old.enabled,
      autoConnect: old.enabled, provider: old.provider, listenPort: old.listenPort,
      ...(old.publicOrigin ? { publicOrigin: old.publicOrigin } : {}) };
    settings = validateIngressSettings(await this.withCredential(settings, old.authtoken || undefined));
    if (!sources.length) { await this.save(settings); return settings; }
    const backupRef = await this.seal('backup', JSON.stringify(sources));
    const journal: MigrationJournal = { schemaVersion: 1, settings, backupRef,
      files: sources.map(row => ({ filename: row.filename, digest: digest(row.contents) })) };
    await atomicWrite(this.journalPath, journal);
    await this.resumeMigration();
    return settings;
  }
  private async resumeMigration() {
    let journal: MigrationJournal;
    try { journal = JSON.parse(await boundedRead(this.journalPath, 256 * 1024)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const settings = validateIngressSettings(journal.settings);
    if (settings.credentialRef) await this.credential(settings);
    if (journal.schemaVersion !== 1 || !Array.isArray(journal.files) || journal.files.length > 512
      || journal.files.some(row => !row || typeof row.filename !== 'string' || !this.allowedSource(row.filename)
        || !/^[a-f0-9]{64}$/.test(row.digest))) throw new Error('Invalid ingress migration.');
    const protectedSources: { filename: string; contents: string }[] = JSON.parse(await this.unseal(journal.backupRef, 'backup'));
    if (!Array.isArray(protectedSources)) throw new Error('Invalid ingress backup.');
    for (const row of journal.files) {
      const backup = protectedSources.find(item => item.filename === row.filename);
      if (!backup || digest(backup.contents) !== row.digest) throw new Error('Invalid ingress backup.');
      try {
        const contents = await boundedRead(row.filename);
        if (row.filename === this.filename && JSON.stringify(JSON.parse(contents)) === JSON.stringify(settings)) continue;
        if (digest(contents) !== row.digest) throw new Error('Ingress changed during migration.');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    if (!journal.files.some(row => row.filename === this.filename)) {
      try {
        if (JSON.stringify(JSON.parse(await boundedRead(this.filename))) !== JSON.stringify(settings)) throw new Error('Ingress changed during migration.');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    await atomicWrite(this.filename, settings);
    for (const row of journal.files) {
      if (row.filename !== this.filename) {
        try {
          if (digest(await boundedRead(row.filename)) !== row.digest) throw new Error('Ingress changed during migration.');
          await unlink(row.filename);
          await syncDirectory(path.dirname(row.filename));
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
    }
    await unlink(this.journalPath);
    await syncDirectory(path.dirname(this.journalPath));
  }
  async save(settings: PlatformIngressSettings) {
    const validated = validateIngressSettings(settings);
    try {
      const current = JSON.parse(await boundedRead(this.filename));
      validateIngressSettings(current);
      await copyFile(this.filename, `${this.filename}.${randomUUID()}.bak`, constants.COPYFILE_EXCL);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await atomicWrite(this.filename, validated);
  }
}
