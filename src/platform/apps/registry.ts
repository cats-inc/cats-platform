import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CatsAppInstallState,
  CatsAppManifestV1,
  CatsInstalledAppRecord,
} from '../../shared/catsAppManifest.js';

export interface CatsAppRegistryState {
  schemaVersion: 1;
  apps: CatsInstalledAppRecord[];
}

export interface CatsAppRegistryInstallInput {
  manifest: CatsAppManifestV1;
  packagePath: string;
  installState?: CatsAppInstallState;
  enabled?: boolean;
}

export interface CatsAppRegistryUpdateStateInput {
  installState: CatsAppInstallState;
  enabled?: boolean;
  lastError?: string | null;
}

export interface CatsAppRegistryUninstallOptions {
  purge?: boolean;
}

export interface FileCatsAppRegistryOptions {
  registryPath: string;
  now?: () => Date;
}

function emptyRegistryState(): CatsAppRegistryState {
  return {
    schemaVersion: 1,
    apps: [],
  };
}

function cloneRecord(record: CatsInstalledAppRecord): CatsInstalledAppRecord {
  return {
    ...record,
    manifest: structuredClone(record.manifest),
  };
}

function cloneState(state: CatsAppRegistryState): CatsAppRegistryState {
  return {
    schemaVersion: 1,
    apps: state.apps.map(cloneRecord),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRegistryState(raw: string): CatsAppRegistryState {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.apps)) {
    throw new Error('Invalid Cats app registry state.');
  }
  return {
    schemaVersion: 1,
    apps: parsed.apps.map((entry) => {
      if (!isRecord(entry) || !isRecord(entry.manifest) || typeof entry.id !== 'string') {
        throw new Error('Invalid Cats app registry record.');
      }
      return entry as unknown as CatsInstalledAppRecord;
    }),
  };
}

function enabledForState(state: CatsAppInstallState): boolean {
  return state === 'enabled';
}

export class FileCatsAppRegistry {
  private readonly registryPath: string;
  private readonly now: () => Date;

  constructor(options: FileCatsAppRegistryOptions) {
    this.registryPath = options.registryPath;
    this.now = options.now ?? (() => new Date());
  }

  async readState(): Promise<CatsAppRegistryState> {
    try {
      return parseRegistryState(await readFile(this.registryPath, 'utf8'));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return emptyRegistryState();
      }
      throw error;
    }
  }

  async listInstalledApps(): Promise<CatsInstalledAppRecord[]> {
    const state = await this.readState();
    return state.apps
      .filter((record) => record.installState !== 'uninstalled')
      .map(cloneRecord);
  }

  async getInstalledApp(appId: string): Promise<CatsInstalledAppRecord | null> {
    const state = await this.readState();
    const matched = state.apps.find((record) => record.id === appId && record.installState !== 'uninstalled');
    return matched ? cloneRecord(matched) : null;
  }

  async installApp(input: CatsAppRegistryInstallInput): Promise<CatsInstalledAppRecord> {
    const state = await this.readState();
    const now = this.now().toISOString();
    const installState = input.installState ?? 'installed';
    const nextRecord: CatsInstalledAppRecord = {
      id: input.manifest.id,
      manifest: structuredClone(input.manifest),
      packagePath: input.packagePath,
      installState,
      enabled: input.enabled ?? enabledForState(installState),
      installedAt: now,
      updatedAt: now,
      lastError: null,
    };
    const existingIndex = state.apps.findIndex((record) => record.id === nextRecord.id);
    if (existingIndex >= 0) {
      const existing = state.apps[existingIndex];
      nextRecord.installedAt = existing.installedAt;
      state.apps[existingIndex] = nextRecord;
    } else {
      state.apps.push(nextRecord);
    }
    await this.writeState(state);
    return cloneRecord(nextRecord);
  }

  async updateAppState(
    appId: string,
    input: CatsAppRegistryUpdateStateInput,
  ): Promise<CatsInstalledAppRecord> {
    const state = await this.readState();
    const record = state.apps.find((entry) => entry.id === appId);
    if (!record) {
      throw new Error(`Cats app "${appId}" is not installed.`);
    }
    record.installState = input.installState;
    record.enabled = input.enabled ?? enabledForState(input.installState);
    record.updatedAt = this.now().toISOString();
    if (input.lastError !== undefined) {
      record.lastError = input.lastError;
    }
    await this.writeState(state);
    return cloneRecord(record);
  }

  async uninstallApp(
    appId: string,
    options: CatsAppRegistryUninstallOptions = {},
  ): Promise<CatsInstalledAppRecord | null> {
    const state = await this.readState();
    const existingIndex = state.apps.findIndex((record) => record.id === appId);
    if (existingIndex < 0) {
      return null;
    }
    const record = state.apps[existingIndex];
    if (options.purge) {
      state.apps.splice(existingIndex, 1);
      await this.writeState(state);
      return cloneRecord({
        ...record,
        installState: 'uninstalled',
        enabled: false,
        updatedAt: this.now().toISOString(),
      });
    }
    record.installState = 'uninstalled';
    record.enabled = false;
    record.updatedAt = this.now().toISOString();
    await this.writeState(state);
    return cloneRecord(record);
  }

  private async writeState(state: CatsAppRegistryState): Promise<void> {
    await mkdir(path.dirname(this.registryPath), { recursive: true });
    const tempPath = `${this.registryPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(cloneState(state), null, 2)}\n`, 'utf8');
    await rename(tempPath, this.registryPath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
