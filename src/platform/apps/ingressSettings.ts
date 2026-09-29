import { mkdir, readFile, readdir, lstat, writeFile, rename, copyFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface PlatformIngressSettings {
  schemaVersion: 2; enabled: boolean; provider: 'ngrok' | 'external'; listenPort: number;
  authtoken: string; publicOrigin?: string;
}
export const emptyIngressSettings: PlatformIngressSettings = {
  schemaVersion: 2, enabled: false, provider: 'ngrok', listenPort: 0, authtoken: '',
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
  if (!input || input.schemaVersion !== 2 || typeof input.enabled !== 'boolean'
    || !['ngrok', 'external'].includes(input.provider ?? '') || !Number.isInteger(input.listenPort)
    || input.listenPort! < 0 || input.listenPort! > 65535
    || typeof input.authtoken !== 'string' || input.authtoken.length > 512
    || (input.enabled && input.provider === 'ngrok' && !/^[A-Za-z0-9_-]{20,512}$/.test(input.authtoken))
    || (input.enabled && input.provider === 'external' && (!input.publicOrigin || input.listenPort === 0))) throw new Error('Invalid ingress settings.');
  return { schemaVersion: 2, enabled: input.enabled, provider: input.provider!, listenPort: input.listenPort!,
    authtoken: input.authtoken, ...(input.publicOrigin ? { publicOrigin: validatePublicOrigin(input.publicOrigin) } : {}) };
}

async function boundedRead(filename: string) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new Error('Unsafe ingress configuration.');
  return readFile(filename, 'utf8');
}

/** Prototype settings are input to migration only, never a fallback execution path. */
export class PlatformIngressSettingsStore {
  constructor(readonly filename: string, readonly legacyDirectory: string) {}
  async read(): Promise<PlatformIngressSettings | null> {
    try { return validateIngressSettings(JSON.parse(await boundedRead(this.filename))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Ingress settings need recovery.'); }
  }
  async legacy(): Promise<{ appId: string; filename: string; settings: PlatformIngressSettings }[]> {
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
      const settings = validateIngressSettings({ ...emptyIngressSettings, enabled: input.enabled,
        authtoken: input.authtoken, ...(input.url ? { publicOrigin: input.url } : {}) });
      result.push({ appId: file.name.slice(0, -5), filename, settings });
    }
    return result;
  }
  async save(settings: PlatformIngressSettings, legacyFiles: string[] = []) {
    const validated = validateIngressSettings(settings);
    await mkdir(path.dirname(this.filename), { recursive: true });
    // Every old configuration is retained before selecting the new host config.
    for (const filename of legacyFiles) {
      const bytes = await boundedRead(filename);
      await writeFile(`${this.filename}.legacy-${randomUUID()}.bak`, bytes, { flag: 'wx', mode: 0o600 });
    }
    try {
      await boundedRead(this.filename);
      await copyFile(this.filename, `${this.filename}.${randomUUID()}.bak`, constants.COPYFILE_EXCL);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(validated), { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.filename);
    } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  }
}
