export { APP_SDK_VERSION, MAX_PACKAGE_BYTES, decodeAppPackage, meetsMinimumVersion, minimumVersion, sha256, supportsVersion } from './format.js';
export const PLATFORM_VERSION: string;
export const componentRunnerUrl: URL;
export const ingressServiceUrl: URL;
export interface AppPin { id: string; version: string; sha256: string; artifact: string }
export interface ResolvedAppPin extends AppPin { bytes: Buffer; manifest: Record<string, any> }
export function readBrowserSdk(): Promise<string>;
export function parseAppLock(value: unknown): { schemaVersion: 1; apps: AppPin[] };
export function resolveAppLock(lockPath: string): Promise<ResolvedAppPin[]>;
export function materializeAppSelection(apps: ResolvedAppPin[]): Promise<string>;
