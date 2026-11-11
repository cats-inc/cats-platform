import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OutputInfo } from 'sharp';
import type { CompanionMediaAsset, CompanionMediaSettings } from './contracts.js';
import type { CompanionBoxStore } from '../state/companion-box/storeTypes.js';
import { getCompanionStorageRootPath } from '../state/companion-box/index.js';
import { CompanionPostError } from './postService.js';
import type { RuntimeClient } from '../../../runtime/client.js';
import { MEDIA_MAX_BYTES } from '../../../runtime/media.js';

export const COMPANION_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
export const companionMediaUrl = (catId: string, assetId: string) =>
  `/api/cats/${encodeURIComponent(catId)}/companion-box/media/${encodeURIComponent(assetId)}`;

export function defaultCompanionMediaSettings(catId: string, now = new Date()): CompanionMediaSettings {
  return { catId, coverAssetId: null, useProfileImages: true, autoPost: false, autoShare: false,
    notify: [], dailyLimit: 2, intervalMinutes: 240, updatedAt: now.toISOString() };
}

/** Immutable, owner-local assets. Neither an uploaded filename nor model text selects a storage path. */
export class CompanionMediaStore {
  readonly directory: string;
  constructor(private readonly store: CompanionBoxStore, chatStatePath: string,
    private readonly now: () => Date = () => new Date(), private readonly runtime?: Pick<RuntimeClient, 'putMediaSource'>) {
    this.directory = path.join(getCompanionStorageRootPath(chatStatePath), 'media');
  }

  async settings(catId: string) {
    return (await this.store.readSnapshot()).mediaSettings.find(row => row.catId === catId)
      ?? defaultCompanionMediaSettings(catId, this.now());
  }

  async updateSettings(catId: string, patch: Partial<Omit<CompanionMediaSettings, 'catId' | 'updatedAt'>>, coverOnlyIfEmpty = false) {
    const allowed = new Set(['coverAssetId', 'useProfileImages', 'autoPost', 'autoShare', 'notify', 'dailyLimit', 'intervalMinutes']);
    if (!patch || typeof patch !== 'object' || Object.keys(patch).some(key => !allowed.has(key))) {
      throw new CompanionPostError('invalid_media_settings');
    }
    return this.store.transaction(snapshot => {
      const previous = snapshot.mediaSettings.find(row => row.catId === catId) ?? defaultCompanionMediaSettings(catId, this.now());
      if (coverOnlyIfEmpty && previous.coverAssetId) return previous;
      const next = { ...previous, ...patch, updatedAt: this.now().toISOString() };
      if (['useProfileImages', 'autoPost', 'autoShare'].some(key => typeof next[key as keyof typeof next] !== 'boolean')
        || !Number.isSafeInteger(next.dailyLimit) || next.dailyLimit < 1 || next.dailyLimit > 20
        || !Number.isSafeInteger(next.intervalMinutes) || next.intervalMinutes < 1 || next.intervalMinutes > 10080
        || !Array.isArray(next.notify) || next.notify.some(row => !['dm', 'telegram'].includes(row))
        || new Set(next.notify).size !== next.notify.length
        || (next.coverAssetId !== null && !snapshot.mediaAssets.some(row => row.catId === catId
          && row.id === next.coverAssetId && row.origin === 'cover'))) throw new CompanionPostError('invalid_media_settings');
      snapshot.mediaSettings = [...snapshot.mediaSettings.filter(row => row.catId !== catId), next];
      snapshot.updatedAt = next.updatedAt;
      return next;
    });
  }

  async list(catId: string) {
    return (await this.store.readSnapshot()).mediaAssets.filter(row => row.catId === catId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  async image(catId: string, bytes: Buffer, origin: CompanionMediaAsset['origin'],
    provenance: { sourceIds?: string[]; jobId?: string } = {}, assertAllowed = () => {}): Promise<CompanionMediaAsset> {
    if (!bytes.length || bytes.length > COMPANION_IMAGE_MAX_BYTES) throw new CompanionPostError('image_size_exceeded');
    let decoded: { data: Buffer; info: OutputInfo };
    try {
      const reader = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
      const metadata = await reader.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error();
      // Decode before publication, normalize orientation, strip private EXIF/location metadata.
      decoded = await reader.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
      // Managed references fit Runtime's existing 8 MiB / 8 MP decoder contract, including phone photos.
      if (decoded.data.length > 8 * 1024 * 1024) decoded = await sharp(decoded.data)
        .resize({ width: 1024, height: 1024, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
    } catch { throw new CompanionPostError('invalid_image_content'); }
    const digest = createHash('sha256').update(decoded.data).digest('hex');
    const id = randomUUID();
    const asset: CompanionMediaAsset = { id, catId, kind: 'image', fileName: `${id}.png`, mimeType: 'image/png',
      bytes: decoded.data.length, sha256: digest, width: decoded.info.width, height: decoded.info.height,
      durationSeconds: null, origin, sourceIds: provenance.sourceIds ?? [], jobId: provenance.jobId ?? null,
      createdAt: this.now().toISOString() };
    await mkdir(this.directory, { recursive: true });
    const filename = path.join(this.directory, asset.fileName);
    await writeFile(filename, decoded.data, { flag: 'wx', mode: 0o600 });
    let persisted: CompanionMediaAsset;
    try {
      persisted = await this.store.transaction(snapshot => {
        assertAllowed();
        const existing = snapshot.mediaAssets.find(row => row.catId === catId && row.sha256 === digest
          && row.origin === origin && row.jobId === asset.jobId && JSON.stringify(row.sourceIds) === JSON.stringify(asset.sourceIds));
        if (existing) return existing;
        snapshot.mediaAssets.push(asset); snapshot.updatedAt = asset.createdAt;
        return asset;
      });
    } catch (error) { await rm(filename, { force: true }); throw error; }
    if (persisted.id !== asset.id) await rm(filename, { force: true });
    return persisted;
  }

  async ingest(catId: string, bytes: Buffer, origin: CompanionMediaAsset['origin'],
    provenance: { sourceIds?: string[]; jobId?: string } = {}, assertAllowed = () => {}): Promise<CompanionMediaAsset> {
    if (bytes.toString('ascii', 4, 8) !== 'ftyp') return this.image(catId, bytes, origin, provenance, assertAllowed);
    if (origin === 'avatar' || origin === 'cover' || bytes.length > MEDIA_MAX_BYTES || !this.runtime?.putMediaSource) throw new CompanionPostError('video_service_unavailable');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = (await this.list(catId)).find(row => row.sha256 === sha256 && row.origin === origin && row.jobId === (provenance.jobId ?? null));
    if (existing) { assertAllowed(); return existing; }
    const id = randomUUID();
    const { metadata } = await this.runtime.putMediaSource(id, bytes);
    if (metadata.mimeType !== 'video/mp4' || metadata.sha256 !== sha256) throw new CompanionPostError('invalid_video_content');
    const asset: CompanionMediaAsset = { id, catId, kind: 'video', fileName: `${id}.mp4`, mimeType: 'video/mp4',
      bytes: bytes.length, sha256, width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds,
      origin, sourceIds: provenance.sourceIds ?? [], jobId: provenance.jobId ?? null, createdAt: this.now().toISOString() };
    await mkdir(this.directory, { recursive: true }); const file = path.join(this.directory, asset.fileName);
    await writeFile(file, bytes, { flag: 'wx' });
    try { return await this.store.transaction(snapshot => { assertAllowed();
      const prior = snapshot.mediaAssets.find(row => row.catId === catId && row.sha256 === sha256 && row.origin === origin && row.jobId === asset.jobId);
      if (prior) return prior;
      snapshot.mediaAssets.push(asset); snapshot.updatedAt = asset.createdAt; return asset;
    }); } catch (error) { await rm(file, { force: true }); throw error; }
  }

  async dataUrl(catId: string, dataUrl: string, origin: 'avatar' | 'cover' | 'source') {
    if (typeof dataUrl !== 'string' || dataUrl.length > COMPANION_IMAGE_MAX_BYTES * 1.4) throw new CompanionPostError('invalid_image_content');
    const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(dataUrl);
    if (!match) throw new CompanionPostError('invalid_image_content');
    return this.image(catId, Buffer.from(match[1]!, 'base64'), origin);
  }

  async read(catId: string, assetId: string) {
    const asset = (await this.store.readSnapshot()).mediaAssets.find(row => row.catId === catId && row.id === assetId);
    if (!asset) throw new CompanionPostError('companion_media_not_found', 404);
    const filename = path.join(this.directory, asset.fileName);
    let data: Buffer;
    try {
      const root = await realpath(this.directory);
      const resolved = await realpath(filename);
      if (!inside(root, resolved)) throw new Error();
      const info = await stat(resolved);
      if (!info.isFile() || info.size !== asset.bytes) throw new Error();
      data = await readFile(resolved);
      if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error();
    } catch { throw new CompanionPostError('companion_media_unavailable', 404); }
    return { asset, data, filename };
  }

  async sourceFiles(catId: string) {
    const profile = await this.store.getLifeProfile(catId);
    if (!profile.photoFolder) return [];
    const root = await realpath(profile.photoFolder).catch(() => null);
    if (!root) throw new CompanionPostError('source_directory_unavailable');
    const files: Array<{ path: string; kind: 'image' | 'video' }> = [];
    async function scan(directory: string, depth: number) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (files.length >= 200) break;
        if (entry.isDirectory() && depth < 2) await scan(path.join(directory, entry.name), depth + 1);
        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (imageExtensions.has(extension) || ['.mp4', '.mov'].includes(extension)) {
          files.push({ path: path.relative(root!, path.join(directory, entry.name)), kind: imageExtensions.has(extension) ? 'image' : 'video' });
        }
      }
    }
    await scan(root, 0);
    return files;
  }

  async importSource(catId: string, relative: string, assertAllowed = () => {}) {
    const profile = await this.store.getLifeProfile(catId);
    if (!profile.photoFolder || typeof relative !== 'string' || relative.length > 2000) throw new CompanionPostError('invalid_source_file');
    const root = await realpath(profile.photoFolder);
    const filename = await realpath(path.resolve(root, relative)).catch(() => null);
    if (!filename || !inside(root, filename)) throw new CompanionPostError('invalid_source_file');
    const info = await stat(filename);
    if (!info.isFile() || info.size > MEDIA_MAX_BYTES) throw new CompanionPostError('image_size_exceeded');
    return this.ingest(catId, await readFile(filename), 'source', {}, assertAllowed);
  }
}
