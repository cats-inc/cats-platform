import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type ProcessWithLoadEnvFile = NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};

interface DesktopEnvLoadOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  desktopDir?: string;
}

export function parseDesktopBoolean(
  rawValue: string | undefined,
  fallback: boolean,
): boolean {
  const trimmed = rawValue?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes') {
    return true;
  }
  if (trimmed === '0' || trimmed === 'false' || trimmed === 'no') {
    return false;
  }
  return fallback;
}

function applyEnvFileFallback(
  envFilePath: string,
  env: NodeJS.ProcessEnv,
): void {
  // Keep the fallback deliberately narrow: simple KEY=value lines only.
  // Advanced dotenv features stay owned by Node's native loadEnvFile().
  const contents = fs.readFileSync(envFilePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(env, key)) {
      continue;
    }

    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }
}

export function loadDesktopEnvFile(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const envFilePath = path.join(cwd, '.env');
  if (!fs.existsSync(envFilePath)) {
    return null;
  }

  const processWithLoadEnvFile = process as ProcessWithLoadEnvFile;
  if (env === process.env && typeof processWithLoadEnvFile.loadEnvFile === 'function') {
    processWithLoadEnvFile.loadEnvFile(envFilePath);
    return envFilePath;
  }

  applyEnvFileFallback(envFilePath, env);
  return envFilePath;
}

function resolveDesktopEnvFilePaths(
  options: DesktopEnvLoadOptions = {},
): string[] {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const desktopDir = options.desktopDir
    ?? env.CATS_DESKTOP_DIR?.trim()
    ?? path.join(homedir(), '.cats', 'desktop');

  return [
    path.join(cwd, '.env'),
    path.join(desktopDir, '.env'),
  ];
}

export function loadDesktopEnvFiles(
  options: DesktopEnvLoadOptions = {},
): string[] {
  const env = options.env ?? process.env;
  const loaded: string[] = [];

  for (const envFilePath of resolveDesktopEnvFilePaths(options)) {
    if (!fs.existsSync(envFilePath)) {
      continue;
    }

    const loadedPath = loadDesktopEnvFile(path.dirname(envFilePath), env);
    if (loadedPath) {
      loaded.push(loadedPath);
    }
  }

  return loaded;
}
