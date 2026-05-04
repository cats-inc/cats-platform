import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';

const ROOT = process.cwd();

const SCAN_ROOTS = [
  'mobile/app',
  'mobile/src/renderer',
  'src/app/renderer',
  'src/design',
  'src/products/chat/renderer',
  'src/products/code/renderer',
  'src/products/shared/renderer',
  'src/products/work/renderer',
] as const;

const UI_PROPERTY_PATTERN =
  /\b(label|title|description|placeholder|emptyState|actionLabel|ariaLabel|tooltip|caption|eyebrow|summary|subtitle|helperText|text)\s*[:=]\s*(['"`])((?:(?!\2)[\s\S])*?[A-Z][\s\S]*?)\2/gu;
const JSX_ATTRIBUTE_PATTERN =
  /\b(aria-label|title|placeholder|alt)\s*=\s*(['"])([^'"]*[A-Z][^'"]*)\2/gu;
const HTML_ENTITY_OR_SYMBOL_PATTERN =
  /^(?:(?:&(?:#x?[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]+);)|[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\s])+$/u;

interface RawStringHit {
  path: string;
  line: number;
  text: string;
}

interface RawStringAllowlistEntry {
  path: string;
  text: string;
  reason: string;
}

const RAW_STRING_ALLOWLIST: RawStringAllowlistEntry[] = [
  {
    path: 'src/design/components/settings/SettingsDangerZone.tsx',
    text: '<${childType}>',
    reason: 'debug-only developer diagnostic surfaced through console.warn',
  },
  {
    path: 'src/design/components/settings/SettingsDangerZone.tsx',
    text: 'special element (Fragment / context / portal)',
    reason: 'debug-only developer diagnostic surfaced through console.warn',
  },
];

function* walkFiles(root: string): Generator<string> {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
      continue;
    }
    if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      yield fullPath;
    }
  }
}

function toRepoPath(filePath: string): string {
  return path.relative(ROOT, filePath).replace(/\\/gu, '/');
}

function lineForIndex(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function isMessageKeyLike(value: string): boolean {
  return /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/u.test(value)
    || /^[a-z][A-Za-z0-9]*$/u.test(value);
}

function normalizeUiLiteral(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function isPotentialRawUiLiteral(value: string): boolean {
  const text = normalizeUiLiteral(value);
  if (!text || isMessageKeyLike(text) || HTML_ENTITY_OR_SYMBOL_PATTERN.test(text)) {
    return false;
  }
  return /[A-Z]/u.test(text);
}

function isAllowed(hit: RawStringHit): boolean {
  return RAW_STRING_ALLOWLIST.some((entry) =>
    entry.path === hit.path && entry.text === hit.text);
}

function collectJsxTextHits(repoPath: string, filePath: string, source: string): RawStringHit[] {
  const hits: RawStringHit[] = [];
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const addHit = (rawText: string, index: number): void => {
    const text = normalizeUiLiteral(rawText);
    if (!isPotentialRawUiLiteral(text)) {
      return;
    }
    hits.push({
      path: repoPath,
      line: lineForIndex(source, index),
      text,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      addHit(node.getText(sourceFile), node.getStart(sourceFile));
    }
    if (
      ts.isJsxExpression(node)
      && node.expression
      && ts.isStringLiteralLike(node.expression)
    ) {
      addHit(node.expression.text, node.expression.getStart(sourceFile));
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return hits;
}

function collectRawStringHits(): RawStringHit[] {
  const hits: RawStringHit[] = [];
  for (const scanRoot of SCAN_ROOTS) {
    const absoluteRoot = path.join(ROOT, scanRoot);
    for (const filePath of walkFiles(absoluteRoot)) {
      const repoPath = toRepoPath(filePath);
      const source = fs.readFileSync(filePath, 'utf8');
      const patterns = [UI_PROPERTY_PATTERN, JSX_ATTRIBUTE_PATTERN];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
          const text = normalizeUiLiteral(match[3] ?? '');
          if (!isPotentialRawUiLiteral(text)) {
            continue;
          }
          hits.push({
            path: repoPath,
            line: lineForIndex(source, match.index),
            text,
          });
        }
      }
      hits.push(...collectJsxTextHits(repoPath, filePath, source));
    }
  }
  return hits.filter((hit) => !isAllowed(hit));
}

test('renderer UI chrome does not add obvious raw English strings outside the localization allowlist', () => {
  const hits = collectRawStringHits();
  assert.deepEqual(
    hits,
    [],
    [
      'Move Cats-owned UI chrome into src/shared/i18n catalogs, or document a SPEC-097 allowlist reason.',
      ...hits.map((hit) => `${hit.path}:${hit.line} ${JSON.stringify(hit.text)}`),
    ].join('\n'),
  );
});
