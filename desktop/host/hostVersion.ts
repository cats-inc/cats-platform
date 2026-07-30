import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface AppPackageJson {
  version?: string;
  build?: {
    appId?: string;
  };
}

function readAppPackageJson(): { path: string; contents: AppPackageJson } {
  const packageJsonPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'package.json',
  );
  return {
    path: packageJsonPath,
    contents: JSON.parse(readFileSync(packageJsonPath, 'utf8')) as AppPackageJson,
  };
}

function readPackageVersion(): string {
  const { path, contents } = readAppPackageJson();
  if (!contents.version) {
    throw new Error(`Could not resolve version from ${path}`);
  }
  return contents.version;
}

/**
 * The electron-builder `appId`, or null when it cannot be read.
 *
 * Windows only shows a native notification when the running process claims the
 * same Application User Model ID as the Start Menu shortcut the installer
 * wrote, and that shortcut carries `appId`. Reading it here keeps the value
 * from becoming a second source of truth; a missing field disables the claim
 * rather than guessing an ID that would silently swallow every notification.
 */
function readAppUserModelId(): string | null {
  try {
    return readAppPackageJson().contents.build?.appId?.trim() || null;
  } catch {
    return null;
  }
}

export const DESKTOP_HOST_VERSION = readPackageVersion();
export const DESKTOP_APP_USER_MODEL_ID = readAppUserModelId();
