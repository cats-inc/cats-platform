// Response contract of GET /api/apps/_market, shared by the server and the Market page.
export type AppMarketCatalogStatus = 'fresh' | 'cached' | 'expired' | 'unavailable';

export type AppMarketAction = 'install' | 'update' | 'installed' | 'managed-by-desktop' | 'incompatible';

/** Whether the installed copy is the one this host installed from the catalog. */
export type AppMarketInstalledSource = 'market' | 'other';

export interface AppMarketEntry {
  id: string;
  displayName: string;
  description: string;
  icon: string | null;
  /** The stable catalog version offered for install or update. */
  version: string;
  notes: string;
  permissions: string[];
  publisher: { name: string; homepage?: string };
  compatibility: { catsPlatform: string; appSdk: string };
  installedVersion: string | null;
  installedSource: AppMarketInstalledSource | null;
  /** Set when the installed version was withdrawn from the catalog. */
  installedWithdrawnReason: string | null;
  action: AppMarketAction;
}

export interface AppMarketSnapshot {
  status: AppMarketCatalogStatus;
  revision: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  fetchedAt: string | null;
  apps: AppMarketEntry[];
  error?: { code: string; message: string };
}
