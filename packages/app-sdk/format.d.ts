export type {
  CatsAppBrowserSdkV1,
  CatsImageJob,
  UsageGuardrailV1,
  UsageQuotaRefreshV1,
  UsageSnapshotV1,
  UsageTargetV1,
  UsageTotalsV1,
} from './browser.js';

export const APP_SDK_VERSION: string;
export const MAX_PACKAGE_BYTES: number;
export const MAX_EXPANDED_BYTES: number;
export const MAX_APP_FILES: number;
export const MAX_APP_FILE_BYTES: number;
export const SHA256_PATTERN: RegExp;
export interface AppPackageExpectation { id: string; version: string; sha256: string }
export interface DecodedAppPackage {
  manifest: Record<string, any>; files: { path: string; data: Buffer }[]; sha256: string;
}
export function isPlainObject(value: unknown): value is Record<string, any>;
export function sha256(bytes: Uint8Array): string;
export function supportsVersion(version: string, range: string): boolean;
/** Lower bound of a supported range as [major, minor, patch]; null for unsupported grammar. */
export function minimumVersion(range: string): [number, number, number] | null;
/** ADR-128: true when version is at or above the floor of range; catsPlatform is a minimum, not a range. */
export function meetsMinimumVersion(version: string, range: string): boolean;
export function assertAppIdentity(id: unknown, version: unknown): void;
export function decodeAppPackage(bytes: Uint8Array, expected?: AppPackageExpectation): DecodedAppPackage;
