export const APP_SDK_VERSION: string;
export const PLATFORM_VERSION: string;
export const MAX_PACKAGE_BYTES: number;
export interface AppPin { id: string; version: string; sha256: string; artifact: string }
export interface ResolvedAppPin extends AppPin { bytes: Buffer; manifest: Record<string, any> }
export function sha256(bytes: Uint8Array): string;
export function readBrowserSdk(): Promise<string>;
export function supportsVersion(version: string, range: string): boolean;
export function decodeAppPackage(bytes: Uint8Array, expected?: Pick<AppPin, 'id' | 'version' | 'sha256'>): {
  manifest: Record<string, any>; files: { path: string; data: Buffer }[]; sha256: string;
};
export function parseAppLock(value: unknown): { schemaVersion: 1; apps: AppPin[] };
export function resolveAppLock(lockPath: string): Promise<ResolvedAppPin[]>;
export function materializeAppSelection(apps: ResolvedAppPin[]): Promise<string>;
