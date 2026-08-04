import fs from 'node:fs';
import path from 'node:path';

import {
  resolveDefaultPlatformDir,
  resolvePlatformConfigDir,
} from './platformPaths.js';

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

export function loadProjectEnvFiles(
  options: ProjectEnvLoadOptions = {},
): string[] {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const loaded: string[] = [];
  const projectEnvPath = loadProjectEnvFile(cwd, env);
  if (projectEnvPath) {
    loaded.push(projectEnvPath);
  }

  // Resolve this only after loading the project .env: a self-hosted checkout
  // may define CATS_PLATFORM_DIR there, and its platform config .env must then
  // come from the same storage root used by the server and secret provisioner.
  const homeDir = env.HOME?.trim() || env.USERPROFILE?.trim() || undefined;
  const platformConfigDir = options.platformConfigDir
    ?? resolvePlatformConfigDir(
      env.CATS_PLATFORM_DIR?.trim() || resolveDefaultPlatformDir(homeDir),
    );
  if (path.resolve(platformConfigDir) === path.resolve(cwd)) {
    return loaded;
  }

  const platformEnvPath = loadProjectEnvFile(platformConfigDir, env);
  if (platformEnvPath) {
    loaded.push(platformEnvPath);
  }

  return loaded;
}
