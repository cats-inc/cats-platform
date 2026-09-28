export interface CatsAppPackageFile { path: string; data: Uint8Array }
export interface CatsAppPackageInput { manifest: Record<string, unknown>; files: readonly CatsAppPackageFile[] }
export function encodeAppPackage(input: CatsAppPackageInput): Buffer;
