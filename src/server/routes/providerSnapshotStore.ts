import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProductProviderDescriptor,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';

export const PROVIDER_SNAPSHOT_SCHEMA_VERSION = 1;

const VALID_REGISTRY_STATES: ReadonlySet<ProviderSnapshotRegistryReadModel['state']> = new Set([
  'ready',
  'no_usable_targets',
  'runtime_unreachable',
]);

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

function isProviderInstanceShape(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const instance = value as Record<string, unknown>;
  if (typeof instance.id !== 'string' || !instance.id) return false;
  if (typeof instance.label !== 'string') return false;
  return true;
}

function isProviderDescriptorShape(value: unknown): value is ProductProviderDescriptor {
  if (!value || typeof value !== 'object') return false;
  const descriptor = value as Record<string, unknown>;
  if (typeof descriptor.id !== 'string' || !descriptor.id) return false;
  if (typeof descriptor.label !== 'string') return false;
  if (!Array.isArray(descriptor.instances)) return false;
  return descriptor.instances.every(isProviderInstanceShape);
}

function isValidRegistry(value: unknown): value is ProviderSnapshotRegistryReadModel {
  if (!value || typeof value !== 'object') return false;
  const registry = value as Record<string, unknown>;
  if (typeof registry.state !== 'string') return false;
  if (!VALID_REGISTRY_STATES.has(registry.state as ProviderSnapshotRegistryReadModel['state'])) {
    return false;
  }
  if (!Array.isArray(registry.providers)) return false;
  if (!registry.providers.every(isProviderDescriptorShape)) return false;
  if (
    registry.warnings !== undefined
    && !(Array.isArray(registry.warnings) && registry.warnings.every((entry) => typeof entry === 'string'))
  ) {
    return false;
  }
  return true;
}

function catalogBodyMatchesEntry(
  body: unknown,
  provider: string,
  instance: string | null,
): boolean {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as { provider?: unknown; instance?: unknown };
  if (candidate.provider !== provider) return false;
  const bodyInstance = typeof candidate.instance === 'string' ? candidate.instance : null;
  return bodyInstance === instance;
}

function isValidCatalogEntry(value: unknown): value is ProviderSnapshotCatalogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.provider !== 'string' || !entry.provider) return false;
  const instance = entry.instance === null
    ? null
    : typeof entry.instance === 'string' ? entry.instance : undefined;
  if (instance === undefined) return false;
  if (entry.models !== null && !catalogBodyMatchesEntry(entry.models, entry.provider, instance)) {
    return false;
  }
  if (entry.advanced !== null && !catalogBodyMatchesEntry(entry.advanced, entry.provider, instance)) {
    return false;
  }
  // At least one catalog body must be present; otherwise the entry is useless.
  return entry.models !== null || entry.advanced !== null;
}

export async function loadProviderSnapshot(
  filePath: string,
): Promise<ProviderSnapshot | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
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
  const registry = isValidRegistry(candidate.registry) ? candidate.registry : null;
  const catalogs = Array.isArray(candidate.catalogs)
    ? candidate.catalogs.filter(isValidCatalogEntry)
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
