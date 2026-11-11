// Loaded with `node --import` before the test suite. Many tests create conversations, sessions
// and attachment folders through code that falls back to the developer's own `~/.cats` when
// CATS_RUNTIME_DIR or CATS_PLATFORM_DIR is unset, and a knowledge test reads the local
// knowledge overlay there. On 2026-11-11 local runs had left about 1,500 empty or fixture-only
// folders under `~/.cats/runtime/data/channels`.
//
// This points both at a fresh temporary folder for the whole run, unless the caller already set
// them. The suite runs in one process (`--test-isolation=none`), so setting them once covers
// every test. A test that needs the real default can set CATS_TEST_KEEP_CATS_HOME=1 for its own
// run, which leaves both untouched.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.CATS_TEST_KEEP_CATS_HOME !== '1') {
  const root = mkdtempSync(join(tmpdir(), 'cats-test-home-'));
  if (!process.env.CATS_RUNTIME_DIR?.trim()) process.env.CATS_RUNTIME_DIR = join(root, 'runtime');
  if (!process.env.CATS_PLATFORM_DIR?.trim()) process.env.CATS_PLATFORM_DIR = join(root, 'platform');
  process.on('exit', () => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // A leftover temporary folder is harmless; the operating system clears it.
    }
  });
}
