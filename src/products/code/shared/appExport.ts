import type {
  CatsAppManifestV1,
  CatsLobbyAppContribution,
} from '../../../shared/catsAppManifest.js';

export const CATS_CODE_USER_APP_TEMPLATE_ID = 'user-app';
export const CATS_CODE_USER_APP_TEMPLATE_PACKAGE_PATH =
  'src/products/code/templates/user-app';
export const CATS_CODE_USER_APP_TEMPLATE_RENDERER_ENTRYPOINT =
  'dist/renderer/index.html';
export const CATS_CODE_APP_EXPORT_METADATA_FILE = 'cats-code-export.json';

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

export interface CreateCatsCodeUserAppTemplateManifestInput {
  appId: string;
  displayName: string;
  description?: string;
  version?: string;
  publisherName?: string;
  lobbyEntryId?: string;
  lobbyTitle?: string;
  lobbySubtitle?: string;
  lobbyIcon?: string;
}

export function createCatsCodeUserAppTemplateManifest(
  input: CreateCatsCodeUserAppTemplateManifestInput,
): CatsAppManifestV1 {
  const routePath = `/apps/${input.appId}` as `/apps/${string}`;
  const lobbyEntry: CatsLobbyAppContribution = {
    id: input.lobbyEntryId ?? 'main',
    title: input.lobbyTitle ?? input.displayName,
    routePath,
    maturity: 'preview',
  };

  if (input.lobbySubtitle) {
    lobbyEntry.subtitle = input.lobbySubtitle;
  } else if (input.description) {
    lobbyEntry.subtitle = input.description;
  }
  if (input.lobbyIcon) {
    lobbyEntry.icon = input.lobbyIcon;
  }

  return {
    schemaVersion: 1,
    id: input.appId,
    displayName: input.displayName,
    version: input.version ?? '0.1.0',
    description: input.description,
    category: 'user-app',
    trustTier: 'local-user',
    publisher: {
      name: input.publisherName ?? 'Local User',
    },
    compatibility: {
      catsPlatform: '^0.1.0',
      appSdk: '1.x',
    },
    entrypoints: {
      renderer: CATS_CODE_USER_APP_TEMPLATE_RENDERER_ENTRYPOINT,
    },
    contributions: {
      lobbyApps: [lobbyEntry],
    },
    permissions: [
      'ui.route',
      'ui.lobby',
      'storage.appData',
    ],
  };
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
