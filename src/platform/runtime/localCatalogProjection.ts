import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppConfig } from '../../config.js';

export interface LocalCatalogInformation {
  source: 'local_candidate' | 'last_accepted' | 'unavailable' | 'remote';
  catalogRevision?: string;
  diagnostics: string[];
  scopes: Array<{ provider: string; backend: string; transport?: string; models: Array<{ id: string; label: string }> }>;
}

/** Informational labels only. Never participates in target/picker availability. */
export async function readLocalCatalogInformation(config: Pick<AppConfig,
  'runtimeBaseUrl' | 'runtimeDir' | 'runtimeCatalogPackageRoot' | 'runtimeCatalogConfigPath'>): Promise<LocalCatalogInformation> {
  const hostname = new URL(config.runtimeBaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) return { source: 'remote', diagnostics: [], scopes: [] };
  const root = config.runtimeCatalogPackageRoot;
  if (!root || !isAbsolute(root) || !isAbsolute(config.runtimeDir)) return { source: 'unavailable', diagnostics: ['Local Runtime package paths are not configured.'], scopes: [] };
  try {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const exported = manifest.exports?.['./catalogs'];
    const modulePath = typeof exported === 'string' ? exported : exported?.import;
    if (typeof modulePath !== 'string' || !modulePath.startsWith('./') || modulePath.includes('..')) throw new Error('Runtime catalog module is unavailable.');
    const module = await import(pathToFileURL(join(root, modulePath)).href);
    if (module.catalogCapabilities?.schemaVersion !== 2 || module.catalogCapabilities?.bindingVersion !== 1
      || module.catalogCapabilities?.localOverrides !== true) throw new Error('Runtime catalog schema is unsupported.');
    const projection = module.readLocalCatalogProjection({ packageRoot: root, runtimeRoot: config.runtimeDir,
      ...(config.runtimeCatalogConfigPath ? { configPath: config.runtimeCatalogConfigPath } : {}) });
    return { source: projection.source, diagnostics: projection.diagnostics,
      ...(projection.snapshot ? { catalogRevision: projection.snapshot.catalogRevision } : {}),
      scopes: (projection.snapshot?.document.catalogs ?? []).map((scope: LocalCatalogInformation['scopes'][number]) => ({
        provider: scope.provider, backend: scope.backend, ...(scope.transport ? { transport: scope.transport } : {}),
        models: scope.models.map(model => ({ id: model.id, label: model.label })),
      })),
    };
  } catch (error) {
    return { source: 'unavailable', diagnostics: [error instanceof Error ? error.message : String(error)], scopes: [] };
  }
}
