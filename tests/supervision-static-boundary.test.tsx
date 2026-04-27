import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const PRODUCTS_ROOT = path.join(SOURCE_ROOT, 'products');
const SUPERVISION_ROOT = path.join(SOURCE_ROOT, 'platform', 'supervision');

const STATIC_IMPORT_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

test('platform supervision does not import product renderer or design modules', () => {
  const violations = collectImportViolations({
    files: collectSourceFiles(SUPERVISION_ROOT),
    forbidden: (resolvedSpecifier) =>
      includesPathSegment(resolvedSpecifier, ['src', 'products']) ||
      includesPathSegment(resolvedSpecifier, ['src', 'design']) ||
      includesPathSegment(resolvedSpecifier, ['src', 'app', 'renderer']) ||
      includesPathSegment(resolvedSpecifier, ['src', 'renderer']),
  });

  assert.deepEqual(violations, []);
});

test('run-state and scheduler supervision modules stay content-blind', () => {
  const lifecycleFiles = collectSourceFiles(SUPERVISION_ROOT).filter((filePath) =>
    /(?:runState|scheduler|lifecycle)\.ts$/.test(filePath),
  );
  const violations = collectImportViolations({
    files: lifecycleFiles,
    forbidden: (resolvedSpecifier) =>
      includesPathSegment(resolvedSpecifier, ['src', 'products', 'chat']) ||
      /(?:transcript|messageContent|messageSegments|promptContent|rawPrompt)/i.test(
        resolvedSpecifier,
      ),
  });

  assert.deepEqual(violations, []);
});

test('product code calls runtime create/send only through supervision runtime boundary', () => {
  const files = collectSourceFiles(PRODUCTS_ROOT);
  const violations = collectTextViolations({
    files,
    forbidden: [
      'runtimeClient.createSession(',
      'runtimeClient.sendMessage(',
      'context.dependencies.runtimeClient.createSession(',
      'context.dependencies.runtimeClient.sendMessage(',
    ],
  });

  assert.deepEqual(violations, []);
});

test('non-Chat product trees do not import old orchestration planner or dispatcher modules', () => {
  const nonChatProductRoots = ['code', 'shared', 'work']
    .map((product) => path.join(PRODUCTS_ROOT, product));
  const files = nonChatProductRoots.flatMap((root) => collectSourceFiles(root));
  const violations = collectImportViolations({
    files,
    forbidden: (resolvedSpecifier) =>
      includesPathSegment(resolvedSpecifier, ['src', 'platform', 'orchestration'])
      && /(?:planner|dispatch)/i.test(path.basename(resolvedSpecifier)),
  });

  assert.deepEqual(violations, []);
});

function collectSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (entryPath.endsWith('.ts') || entryPath.endsWith('.tsx')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function collectTextViolations(input: {
  files: string[];
  forbidden: string[];
}): string[] {
  const violations: string[] = [];

  for (const filePath of input.files) {
    const source = readFileSync(filePath, 'utf8');
    for (const forbidden of input.forbidden) {
      if (source.includes(forbidden)) {
        violations.push(`${path.relative(process.cwd(), filePath)} contains ${forbidden}`);
      }
    }
  }

  return violations.sort();
}

function collectImportViolations(input: {
  files: string[];
  forbidden(resolvedSpecifier: string): boolean;
}): string[] {
  const violations: string[] = [];

  for (const filePath of input.files) {
    const source = readFileSync(filePath, 'utf8');
    for (const specifier of collectImportSpecifiers(source)) {
      const resolvedSpecifier = resolveImportSpecifier(filePath, specifier);
      if (input.forbidden(resolvedSpecifier)) {
        violations.push(`${path.relative(process.cwd(), filePath)} -> ${specifier}`);
      }
    }
  }

  return violations.sort();
}

function collectImportSpecifiers(source: string): string[] {
  return [
    ...collectPatternMatches(source, STATIC_IMPORT_PATTERN),
    ...collectPatternMatches(source, DYNAMIC_IMPORT_PATTERN),
  ];
}

function collectPatternMatches(source: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null = pattern.exec(source);

  while (match !== null) {
    const specifier = match[1];
    if (specifier !== undefined) {
      matches.push(specifier);
    }
    match = pattern.exec(source);
  }

  pattern.lastIndex = 0;
  return matches;
}

function resolveImportSpecifier(filePath: string, specifier: string): string {
  if (!specifier.startsWith('.')) {
    return specifier;
  }

  return path.normalize(path.resolve(path.dirname(filePath), specifier));
}

function includesPathSegment(filePath: string, segments: string[]): boolean {
  const normalizedSegments = path.normalize(filePath).split(path.sep);

  return normalizedSegments.some((_, index) =>
    segments.every((segment, offset) => normalizedSegments[index + offset] === segment),
  );
}
