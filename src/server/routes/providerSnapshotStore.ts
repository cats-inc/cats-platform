import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProductProviderDescriptor,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';

export const PROVIDER_SNAPSHOT_SCHEMA_VERSION = 1;

export interface ProviderSnapshotRegistryReadModel {
  state: 'ready' | 'no_usable_targets' | 'runtime_unreachable';
  providers: ProductProviderDescriptor[];
  warnings?: string[];
}

export interface ProviderSnapshotCatalogEntry {
  provider: string;
  instance: string | null;
  models: ProviderModelCatalog | null;
  advanced: ProviderAdvancedModelCatalog | null;
}

export interface ProviderSnapshot {
  schemaVersion: number;
  savedAt: string;
  registry: ProviderSnapshotRegistryReadModel | null;
  catalogs: ProviderSnapshotCatalogEntry[];
}

export function createEmptyProviderSnapshot(): ProviderSnapshot {
  return {
    schemaVersion: PROVIDER_SNAPSHOT_SCHEMA_VERSION,
    savedAt: new Date(0).toISOString(),
    registry: null,
    catalogs: [],
  };
}

export async function loadProviderSnapshot(
  filePath: string,
): Promise<ProviderSnapshot | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Partial<ProviderSnapshot>;
  if (candidate.schemaVersion !== PROVIDER_SNAPSHOT_SCHEMA_VERSION) {
    return null;
  }

  const savedAt = typeof candidate.savedAt === 'string'
    ? candidate.savedAt
    : new Date(0).toISOString();
  const registry = candidate.registry && typeof candidate.registry === 'object'
    ? candidate.registry as ProviderSnapshotRegistryReadModel
    : null;
  const catalogs = Array.isArray(candidate.catalogs)
    ? candidate.catalogs.filter((entry): entry is ProviderSnapshotCatalogEntry =>
        Boolean(entry)
        && typeof entry === 'object'
        && typeof (entry as ProviderSnapshotCatalogEntry).provider === 'string')
    : [];

  return {
    schemaVersion: PROVIDER_SNAPSHOT_SCHEMA_VERSION,
    savedAt,
    registry,
    catalogs,
  };
}

export async function writeProviderSnapshot(
  filePath: string,
  snapshot: ProviderSnapshot,
): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });

  const payload = {
    ...snapshot,
    schemaVersion: PROVIDER_SNAPSHOT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  };

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  await rename(tempPath, filePath);
}
