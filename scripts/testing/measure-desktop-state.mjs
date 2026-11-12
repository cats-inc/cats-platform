/**
 * ADR-152 Phase 0: isolated synthetic JSON-store baseline in Node or Electron.
 * Usage: node scripts/testing/measure-desktop-state.mjs [--scales=1,10,100]
 *        [--samples=5] [--output=report.json] [--owner-counts=path/to/profile.json]
 *        [--memory-budget-mib=4096] [--counts-only]
 * Build the server first. For Electron set ELECTRON_RUN_AS_NODE=1 and invoke
 * electron.exe with this script. No write targets are inferred from user state.
 * The owner-counts option prints counts and bytes only, never content or IDs.
 * Each scale runs in a separate process; allocation/timeout failures are evidence.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, freemem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
if (args.has('help')) {
  console.log('Usage: node scripts/testing/measure-desktop-state.mjs --scales=1,10,100 --samples=5 --output=report.json [--owner-counts=profile.json]');
} else if (args.has('child')) {
  await measure(Number(args.get('child')), Number(args.get('samples') || 5));
} else {
  const report = {
    measuredAt: new Date().toISOString(),
    runtime: { node: process.versions.node, electron: process.versions.electron ?? null },
    workload: { channelsAt1x: 40, messagesPerChannel: 300, bodyCharacters: 160,
      workflowTurnsPerChannel: 5, parallelGroupSize: 4, participantsPerChannel: 2 },
    freeMemoryBytes: freemem(), scales: [],
  };
  if (args.has('owner-counts')) {
    const readStarted = performance.now();
    const bytes = await readFile(resolve(args.get('owner-counts')));
    const observedReadMs = performance.now() - readStarted;
    const parseStarted = performance.now();
    try {
      const snapshot = JSON.parse(bytes.toString('utf8'));
      const channels = (snapshot.chat ?? snapshot).channels;
      report.ownerCounts = { bytes: bytes.length, channels: channels.length,
        messages: channels.reduce((sum, channel) => sum + channel.messages.length, 0),
        parallelGroups: (snapshot.chat ?? snapshot).parallelChatGroups?.length ?? 0,
        observedReadMs, parseAndCountMs: performance.now() - parseStarted };
    } catch { throw new Error('Owner profile counts could not be read; no content was recorded.'); }
  }
  const scales = args.has('counts-only') ? [] : (args.get('scales') || '1,10,100').split(',').map(Number);
  for (const scale of scales) {
    if (![1, 10, 100].includes(scale)) throw new Error('scales must be 1, 10, or 100');
    const memoryBudget = Number(args.get('memory-budget-mib') || Math.max(512, Math.floor(freemem() / 1024 / 1024 * .6)));
    if (!Number.isSafeInteger(memoryBudget) || memoryBudget < 256) throw new Error('memory-budget-mib must be at least 256');
    // Whole-state normalization/cloning needs several simultaneous representations. The
    // 1x measured RSS is the conservative per-scale allowance; do not page out the owner.
    if (scale * 600 > memoryBudget) {
      const result = { scale, channels: 40 * scale, messages: 12000 * scale, failed: true,
        reason: 'resource_capacity', memoryBudgetMiB: memoryBudget, estimatedPeakMiB: scale * 600 };
      report.scales.push(result); console.log(JSON.stringify(result));
      if (args.has('output')) await writeFile(resolve(args.get('output')), `${JSON.stringify(report, null, 2)}\n`);
      continue;
    }
    const result = await new Promise((resolveChild, reject) => {
      const child = spawn(process.execPath, [`--max-old-space-size=${memoryBudget}`, fileURLToPath(import.meta.url),
        `--child=${scale}`, `--samples=${args.get('samples') || 5}`], { cwd: root, env: process.env });
      let output = ''; let error = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 15 * 60 * 1000);
      child.stdout.on('data', data => { output += data; });
      child.stderr.on('data', data => { error += data; });
      child.once('error', failure => { clearTimeout(timer); reject(failure); });
      child.once('close', code => {
        clearTimeout(timer);
        resolveChild(code === 0 ? JSON.parse(output) :
          { scale, failed: true, timedOut, exitCode: code, diagnostic: error.slice(-1000) });
      });
    });
    report.scales.push(result);
    console.log(JSON.stringify(result));
    if (args.has('output')) await writeFile(resolve(args.get('output')), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.has('output')) await writeFile(resolve(args.get('output')), `${JSON.stringify(report, null, 2)}\n`);
  if (report.scales.some(result => result.failed)) process.exitCode = 1;
  if (!args.has('output')) console.log(JSON.stringify(report, null, 2));
}

async function measure(scale, samples) {
  if (!Number.isInteger(samples) || samples < 3 || samples > 100) throw new Error('samples must be 3..100');
  const load = file => import(pathToFileURL(join(root, 'build/server', file)).href);
  const { createDefaultChatState } = await load('products/chat/state/defaults.js');
  const { createChannel } = await load('products/chat/state/model/index.js');
  const { normalizePersistedChatSnapshot } = await load('products/chat/state/chat-snapshot/index.js');
  const { LegacyJsonChatStore } = await load('products/chat/state/store.js');
  const scratch = await mkdtemp(join(tmpdir(), 'cats-desktop-state-measure-'));
  try {
    let state = createChannel(createDefaultChatState(), {
      originSurface: 'chat', title: 'Synthetic', topic: 'Synthetic measurement only',
      cats: [{ name: 'Synthetic A', provider: 'claude', roles: ['coder'] },
        { name: 'Synthetic B', provider: 'codex', roles: ['reviewer'] }],
    });
    const template = state.channels.find(channel => channel.id === state.selectedChannelId);
    state.channels = Array.from({ length: 40 * scale }, (_, index) => {
      const id = `synthetic-${index}`;
      const turns = Array.from({ length: 5 }, (_, seq) => ({
        id: `turn-${id}-${seq}`, status: 'completed', sourceMessageId: `${id}-${seq * 2}`,
        sourceSenderKind: 'user', sourceSenderName: 'Synthetic', guard: null,
        stageId: 'complete', workflowShape: 'linear', reviewRequired: false,
        lastCheckpointId: null, convergeTargetId: null, continuationCount: 0, dispatchCount: 0,
        targetStatuses: [], events: [], startedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z', completedAt: '2026-01-01T00:00:01.000Z',
      }));
      return { ...template, id, roomRouting: { ...template.roomRouting,
        workflow: { ...template.roomRouting.workflow, turnHistory: turns } },
        messages: Array.from({ length: 300 }, (_, seq) => ({
        id: `${id}-${seq}`, channelId: id, senderKind: seq % 2 ? 'agent' : 'user',
        senderName: 'Synthetic', body: 'Synthetic 中文日本語한글 '.padEnd(160, 'x'), choices: [],
        mentions: [], metadata: {}, usage: null, createdAt: new Date(1700000000000 + seq * 1000).toISOString(),
      })) };
    });
    state.selectedChannelId = state.channels[0].id;
    state.parallelChatGroups = Array.from({ length: 10 * scale }, (_, index) => ({
      id: `parallel-${index}`, title: 'Synthetic parallel', originSurface: 'chat', mode: 'parallel',
      status: 'active', memberChannelIds: state.channels.slice(index * 4, index * 4 + 4).map(channel => channel.id),
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastMessageAt: null,
    }));
    const snapshot = normalizePersistedChatSnapshot(state);
    if (snapshot.chat.channels.length !== 40 * scale || snapshot.chat.parallelChatGroups.length !== 10 * scale
      || snapshot.turns.length < 5 * 40 * scale) throw new Error('Synthetic workload did not survive normalization');
    // Benchmark a current, initialized profile. Otherwise LegacyJsonChatStore's setup repair
    // writes the entire snapshot during the supposed cold-read measurement.
    snapshot.setupCompleteAt = '2026-01-01T00:00:00.000Z';
    state = null;
    const text = JSON.stringify(snapshot);
    const file = join(scratch, 'chat-state.local.json');
    await writeFile(file, text);
    const timed = async work => { const started = performance.now(); await work(); return performance.now() - started; };
    const normalizationMs = await timed(() => normalizePersistedChatSnapshot(JSON.parse(text)));
    const coldReadMs = await timed(() => new LegacyJsonChatStore(file).read());
    if (await readFile(file, 'utf8') !== text) throw new Error('Cold-read benchmark unexpectedly changed its source');
    const store = new LegacyJsonChatStore(file);
    const changes = [];
    for (let index = 0; index < samples; index++) {
      changes.push(await timed(async () => {
        await store.updateSnapshot(({ chat, core }) => {
          chat.channels[0].messages[0].body = `changed ${index}`;
          return { chat, core };
        });
      }));
    }
    changes.sort((a, b) => a - b);
    console.log(JSON.stringify({ scale, channels: 40 * scale, messages: 12000 * scale,
      bytes: Buffer.byteLength(text), samples, changeP50Ms: changes[Math.ceil(samples * .5) - 1],
      changeP95Ms: changes[Math.ceil(samples * .95) - 1], coldReadMs, normalizationMs,
      peakRssBytes: process.resourceUsage().maxRSS * 1024 }));
  } finally { await rm(scratch, { recursive: true, force: true, maxRetries: 10 }); }
}
