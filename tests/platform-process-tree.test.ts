import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createFileProcessRecordRegistry,
  readProcessRecords,
  sweepRecordedProcessTrees,
} from '../src/platform/process/processRegistry.ts';
import {
  findTreeRemnants,
  killProcessTreeRemnants,
  parseElapsed,
  parsePosixProcessList,
  parseWindowsProcessList,
  type ProcessEntry,
} from '../src/platform/process/processTree.ts';

const T = 1_790_000_000_000;

test('process listings parse on both platforms', () => {
  assert.deepEqual(parseWindowsProcessList('  4 0 1789999000000\r\n100 4 1790000000500\r\nbad line\r\n'), [
    { pid: 4, ppid: 0, startMs: 1_789_999_000_000 },
    { pid: 100, ppid: 4, startMs: 1_790_000_000_500 },
  ]);
  assert.deepEqual(parsePosixProcessList('  1     0     1 3-04:05:06\n 200     1   200      01:05\n', T), [
    { pid: 1, ppid: 0, pgid: 1, startMs: T - ((3 * 24 + 4) * 3600 + 5 * 60 + 6) * 1000 },
    { pid: 200, ppid: 1, pgid: 200, startMs: T - 65_000 },
  ]);
  assert.equal(parseElapsed('12:34:56'), 12 * 3600 + 34 * 60 + 56);
  assert.equal(parseElapsed('nonsense'), null);
});

test('Windows remnants follow parent ids from a dead root, leaves first', () => {
  const entries: ProcessEntry[] = [
    { pid: 50, ppid: 10, startMs: T + 1_000 },
    { pid: 60, ppid: 50, startMs: T + 2_000 },
    { pid: 70, ppid: 10, startMs: T - 60_000 }, // older than the root: not ours
    { pid: 80, ppid: 99, startMs: T + 3_000 },
  ];
  assert.deepEqual(findTreeRemnants(entries, 10, T, 'win32').map((entry) => entry.pid), [60, 50]);
  // The root is alive and is the recorded process: it goes last.
  assert.deepEqual(
    findTreeRemnants([{ pid: 10, ppid: 1, startMs: T + 300 }, ...entries], 10, T, 'win32').map((entry) => entry.pid),
    [60, 50, 10],
  );
  // A live process reusing the root id means the tree is gone: kill nothing.
  assert.deepEqual(findTreeRemnants([{ pid: 10, ppid: 1, startMs: T + 600_000 }, ...entries], 10, T, 'win32'), []);
});

test('POSIX remnants are the root process group, even after reparenting', () => {
  const entries: ProcessEntry[] = [
    { pid: 51, ppid: 1, pgid: 10, startMs: T + 1_000 },
    { pid: 52, ppid: 51, pgid: 10, startMs: T + 2_000 },
    { pid: 53, ppid: 1, pgid: 53, startMs: T + 2_000 },
    { pid: 54, ppid: 1, pgid: 10, startMs: T - 60_000 },
  ];
  assert.deepEqual(findTreeRemnants(entries, 10, T, 'linux').map((entry) => entry.pid).sort(), [51, 52]);
});

test('killProcessTreeRemnants signals only what it found', async () => {
  const killed: number[] = [];
  const result = await killProcessTreeRemnants(10, T, {
    platform: 'win32',
    listProcesses: async () => [{ pid: 50, ppid: 10, startMs: T + 1 }, { pid: 60, ppid: 50, startMs: T + 2 }],
    kill: (pid) => {
      if (pid === 50) throw new Error('already gone');
      killed.push(pid);
    },
  });
  assert.deepEqual(killed, [60]);
  assert.deepEqual(result, [60]);
});

test('the crash sweep ends each recorded tree once and keeps records added meanwhile', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cats-process-registry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'state', 'component-processes.json');
  const registry = createFileProcessRecordRegistry(file);
  registry.record({ id: 'a', processId: 10, startedAt: T });
  registry.record({ id: 'b', processId: 20, startedAt: T });
  let listings = 0;
  const killed: number[] = [];
  const result = await sweepRecordedProcessTrees(registry, {
    platform: 'win32',
    listProcesses: async () => {
      listings += 1;
      registry.record({ id: 'c', processId: 30, startedAt: T });
      return [{ pid: 11, ppid: 10, startMs: T + 1 }, { pid: 21, ppid: 20, startMs: T - 60_000 }];
    },
    kill: (pid) => { killed.push(pid); },
  });
  assert.equal(listings, 1, 'one listing for every record');
  assert.deepEqual(killed, [11]);
  assert.deepEqual(result, { killed: [11], swept: 2 });
  assert.deepEqual(readProcessRecords(file).map((record) => record.id), ['c']);
});

test('a real tree: the grandchild outlives a killed root until the remnants are ended', async (t) => {
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const startedAt = Date.now();
  // The grandchild escapes the Windows kill-on-close job only when detached;
  // on POSIX it stays in the root's process group.
  const script = `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e6)'],`
    + `{stdio:'ignore',detached:process.platform==='win32'});process.stdout.write(String(c.pid));setInterval(()=>{},1e6)`;
  const root = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  const grandchild = await new Promise<number>((resolve) => root.stdout!.once('data', (chunk) => resolve(Number(String(chunk)))));
  t.after(() => { for (const pid of [root.pid!, grandchild]) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } });
  process.kill(root.pid!, 'SIGKILL');
  await waitFor(() => !alive(root.pid!));
  assert.equal(alive(grandchild), true, 'without cleanup the grandchild keeps running');
  const killed = await killProcessTreeRemnants(root.pid!, startedAt);
  assert.ok(killed.includes(grandchild), JSON.stringify(killed));
  await waitFor(() => !alive(grandchild));
});

async function waitFor(check: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the process state.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
