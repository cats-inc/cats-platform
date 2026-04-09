import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveProjectRoot(importMetaUrl) {
  const currentFilePath = fileURLToPath(importMetaUrl);
  const currentDir = path.dirname(currentFilePath);
  const parentDir = path.dirname(currentDir);

  if (path.basename(currentDir) === 'tests') {
    return path.resolve(currentDir, '..');
  }

  if (path.basename(currentDir) === 'helpers' && path.basename(parentDir) === 'tests') {
    return path.resolve(currentDir, '..', '..');
  }

  if (path.basename(currentDir) === 'test' && path.basename(parentDir) === 'build') {
    return path.resolve(currentDir, '..', '..');
  }

  return process.cwd();
}

export function resolveProjectPath(importMetaUrl, ...segments) {
  return path.join(resolveProjectRoot(importMetaUrl), ...segments);
}
