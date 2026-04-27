import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const ROUTING_ROOTS = [
  path.join(SOURCE_ROOT, 'products'),
  path.join(SOURCE_ROOT, 'platform', 'orchestration'),
];
const WEAK_TOOL_EXECUTOR_ALLOWLIST = new Set([
  path.normalize(path.join(SOURCE_ROOT, 'platform', 'supervision', 'workSupervisedTools.ts')),
  path.normalize(path.join(SOURCE_ROOT, 'platform', 'supervision', 'runLoopHandoff.ts')),
]);
const WEAK_PROVIDER_RUNTIME_PATTERNS = [
  /provider\s*:\s*['"]ollama['"]/u,
  /providerRef\s*:\s*['"][^'"]*ollama/u,
  /targetRef\s*:\s*['"]tool:work\.sop\.ask_weak/u,
];
const RUNTIME_CALL_PATTERNS = [
  /runtimeClient\.createSession\s*\(/u,
  /runtimeClient\.sendMessage\s*\(/u,
  /context\.dependencies\.runtimeClient\.createSession\s*\(/u,
  /context\.dependencies\.runtimeClient\.sendMessage\s*\(/u,
  /createSupervisedRuntimeSession\s*\(/u,
  /sendSupervisedRuntimeMessage\s*\(/u,
  /new\s+CatsRuntimeClient\s*\(/u,
];

test('weak-worker routing has no ad-hoc weak-provider runtime entrypoint', () => {
  const violations = ROUTING_ROOTS
    .flatMap((root) => collectSourceFiles(root))
    .flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      const referencesWeakProvider = WEAK_PROVIDER_RUNTIME_PATTERNS.some((pattern) =>
        pattern.test(source));
      const callsRuntime = RUNTIME_CALL_PATTERNS.some((pattern) => pattern.test(source));
      return referencesWeakProvider && callsRuntime
        ? [`${path.relative(process.cwd(), filePath)} mixes weak-provider targeting with runtime calls`]
        : [];
    });

  assert.deepEqual(violations, []);
});

test('work.sop.ask_weak stays inside supervised weak-worker tool contracts', () => {
  const violations = collectSourceFiles(SOURCE_ROOT).flatMap((filePath) => {
    const normalized = path.normalize(filePath);
    if (WEAK_TOOL_EXECUTOR_ALLOWLIST.has(normalized)) {
      return [];
    }

    const source = readFileSync(filePath, 'utf8');
    if (!source.includes('work.sop.ask_weak')) {
      return [];
    }

    const callsRuntime = RUNTIME_CALL_PATTERNS.some((pattern) => pattern.test(source));
    return callsRuntime
      ? [`${path.relative(process.cwd(), filePath)} routes work.sop.ask_weak around toolBoundary`]
      : [];
  });

  assert.deepEqual(violations, []);
});

test('no standalone weak dispatcher module is introduced', () => {
  const violations = collectSourceFiles(SOURCE_ROOT)
    .filter((filePath) => /(?:weak|ollama).*(?:dispatcher|router|orchestrator)/iu.test(
      path.basename(filePath),
    ))
    .map((filePath) => path.relative(process.cwd(), filePath));

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
