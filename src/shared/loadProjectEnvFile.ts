import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type ProcessWithLoadEnvFile = NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};

interface ProjectEnvLoadOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platformConfigDir?: string;
}

function applyEnvFileFallback(
  envFilePath: string,
  env: NodeJS.ProcessEnv,
): void {
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

export function loadProjectEnvFile(
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

function resolveProjectEnvFilePaths(
  options: ProjectEnvLoadOptions = {},
): string[] {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const platformConfigDir = options.platformConfigDir
    ?? path.join(
      env.CATS_PLATFORM_DIR?.trim() || path.join(homedir(), '.cats', 'platform'),
      'config',
    );

  return [
    path.join(cwd, '.env'),
    path.join(platformConfigDir, '.env'),
  ];
}

export function loadProjectEnvFiles(
  options: ProjectEnvLoadOptions = {},
): string[] {
  const env = options.env ?? process.env;
  const loaded: string[] = [];

  for (const envFilePath of resolveProjectEnvFilePaths(options)) {
    if (!fs.existsSync(envFilePath)) {
      continue;
    }

    const loadedPath = loadProjectEnvFile(path.dirname(envFilePath), env);
    if (loadedPath) {
      loaded.push(loadedPath);
    }
  }

  return loaded;
}
