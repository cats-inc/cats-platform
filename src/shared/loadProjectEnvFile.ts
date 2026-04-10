import fs from 'node:fs';
import path from 'node:path';

type ProcessWithLoadEnvFile = NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};

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

export function loadProjectEnvFile(cwd: string = process.cwd()): string | null {
  const envFilePath = path.join(cwd, '.env');
  if (!fs.existsSync(envFilePath)) {
    return null;
  }

  const processWithLoadEnvFile = process as ProcessWithLoadEnvFile;
  if (typeof processWithLoadEnvFile.loadEnvFile === 'function') {
    processWithLoadEnvFile.loadEnvFile(envFilePath);
    return envFilePath;
  }

  applyEnvFileFallback(envFilePath, process.env);
  return envFilePath;
}
