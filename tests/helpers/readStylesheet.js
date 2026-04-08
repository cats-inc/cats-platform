import { readFile as readFileAsync } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPORT_PATTERN = /@import\s+['"]([^'"]+)['"];\s*/gu;

function resolvePath(input) {
  return input instanceof URL ? fileURLToPath(input) : input;
}

async function readStylesheetInternal(filePath, seen) {
  if (seen.has(filePath)) {
    return '';
  }
  seen.add(filePath);

  const source = await readFileAsync(filePath, 'utf8');
  const directory = path.dirname(filePath);
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
  if (seen.has(filePath)) {
    return '';
  }
  seen.add(filePath);

  const source = readFileSync(filePath, 'utf8');
  const directory = path.dirname(filePath);
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
