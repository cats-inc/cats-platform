import { access, readFile as readFileAsync } from 'node:fs/promises';
import { constants, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPORT_PATTERN = /@import\s+['"]([^'"]+)['"];\s*/gu;

function resolvePath(input) {
  return input instanceof URL ? fileURLToPath(input) : input;
}

async function resolveExistingStylesheetPath(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return filePath;
  } catch {
    if (/src[\\/]products[\\/]chat[\\/]renderer[\\/]styles[\\/]/u.test(filePath)) {
      const fallbackPath = filePath.replace(
        /src[\\/]products[\\/]chat[\\/]renderer[\\/]styles[\\/]/u,
        `${['src', 'products', 'shared', 'renderer', 'styles'].join(path.sep)}${path.sep}`,
      );
      await access(fallbackPath, constants.F_OK);
      return fallbackPath;
    }
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  }
}

function resolveExistingStylesheetPathSync(filePath) {
  if (existsSync(filePath)) {
    return filePath;
  }
  if (/src[\\/]products[\\/]chat[\\/]renderer[\\/]styles[\\/]/u.test(filePath)) {
    const fallbackPath = filePath.replace(
      /src[\\/]products[\\/]chat[\\/]renderer[\\/]styles[\\/]/u,
      `${['src', 'products', 'shared', 'renderer', 'styles'].join(path.sep)}${path.sep}`,
    );
    if (existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }
  throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
}

async function readStylesheetInternal(filePath, seen) {
  const resolvedPath = await resolveExistingStylesheetPath(filePath);
  if (seen.has(resolvedPath)) {
    return '';
  }
  seen.add(resolvedPath);

  const source = await readFileAsync(resolvedPath, 'utf8');
  const directory = path.dirname(resolvedPath);
  let output = '';
  let lastIndex = 0;

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    output += source.slice(lastIndex, match.index);
    output += await readStylesheetInternal(path.resolve(directory, match[1]), seen);
    lastIndex = match.index + match[0].length;
  }

  output += source.slice(lastIndex);
  return output;
}

function readStylesheetSyncInternal(filePath, seen) {
  const resolvedPath = resolveExistingStylesheetPathSync(filePath);
  if (seen.has(resolvedPath)) {
    return '';
  }
  seen.add(resolvedPath);

  const source = readFileSync(resolvedPath, 'utf8');
  const directory = path.dirname(resolvedPath);
  let output = '';
  let lastIndex = 0;

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    output += source.slice(lastIndex, match.index);
    output += readStylesheetSyncInternal(path.resolve(directory, match[1]), seen);
    lastIndex = match.index + match[0].length;
  }

  output += source.slice(lastIndex);
  return output;
}

export async function readStylesheet(input) {
  return readStylesheetInternal(resolvePath(input), new Set());
}

export function readStylesheetSync(input) {
  return readStylesheetSyncInternal(resolvePath(input), new Set());
}
