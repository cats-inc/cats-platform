import type { CatsAppManifestV1 } from '../../../shared/catsAppManifest.js';

export type CatsCodeAppExportArtifactKind = 'manifest' | 'renderer' | 'server' | 'worker';

export interface CatsCodeAppExportArtifact {
  kind: CatsCodeAppExportArtifactKind;
  path: string;
  entrypoint: boolean;
}

export interface CatsCodeAppExportMetadata {
  schemaVersion: 1;
  appId: string;
  appVersion: string;
  packagePath: string;
  manifestPath: string;
  artifacts: CatsCodeAppExportArtifact[];
  createdAt: string;
}

export interface CreateCatsCodeAppExportMetadataInput {
  manifest: CatsAppManifestV1;
  packagePath: string;
  manifestPath?: string;
  createdAt?: Date;
}

export function createCatsCodeAppExportMetadata(
  input: CreateCatsCodeAppExportMetadataInput,
): CatsCodeAppExportMetadata {
  const artifacts: CatsCodeAppExportArtifact[] = [
    {
      kind: 'manifest',
      path: input.manifestPath ?? 'cats.app.json',
      entrypoint: true,
    },
  ];

  if (input.manifest.entrypoints?.renderer) {
    artifacts.push({
      kind: 'renderer',
      path: input.manifest.entrypoints.renderer,
      entrypoint: true,
    });
  }
  if (input.manifest.entrypoints?.server) {
    artifacts.push({
      kind: 'server',
      path: input.manifest.entrypoints.server,
      entrypoint: true,
    });
  }
  if (input.manifest.entrypoints?.worker) {
    artifacts.push({
      kind: 'worker',
      path: input.manifest.entrypoints.worker,
      entrypoint: true,
    });
  }

  return {
    schemaVersion: 1,
    appId: input.manifest.id,
    appVersion: input.manifest.version,
    packagePath: input.packagePath,
    manifestPath: input.manifestPath ?? 'cats.app.json',
    artifacts,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  };
}
