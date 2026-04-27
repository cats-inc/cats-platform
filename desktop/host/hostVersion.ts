import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface AppPackageJson {
  version?: string;
}

function readPackageVersion(): string {
  const packageJsonPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'package.json',
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as AppPackageJson;
  if (!packageJson.version) {
    throw new Error(`Could not resolve version from ${packageJsonPath}`);
  }
  return packageJson.version;
}

export const DESKTOP_HOST_VERSION = readPackageVersion();
