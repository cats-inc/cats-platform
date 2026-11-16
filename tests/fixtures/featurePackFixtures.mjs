// Fixture feature packs for SPEC-145 tests (PLAN-138 Phase 1).
//
// Valid archives come from fflate, an independent ZIP writer, so the host's
// reader is not only ever tested against a writer by the same author. Defects
// fflate cannot express are byte patches on its output.

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';

export const FIXTURE_PACK_ID = 'linux-stt';
export const FIXTURE_PACK_ENTRY = 'cats-stt-linux';
export const FIXTURE_MODEL_PATH = 'models/ggml-fixture.bin';
export const FIXTURE_LANGUAGES = ['en', 'zh', 'ja'];

/**
 * A scripted protocol-1 helper (SPEC-145 FR-A4). Scenarios, chosen with
 * CATS_STT_FIXTURE_SCENARIO:
 * - `final` (default): `ready`, then `final` on stop;
 * - `mic_unavailable`, `engine_unavailable`: that error, then `end`;
 * - `exit_before_ready`: exits with status 1 and prints nothing;
 * - `no_ready`: never sends `ready`;
 * - `overrun`: after `ready`, sends `aborted` once CATS_STT_FIXTURE_OVERRUN_MS
 *   (default 50) pass, as the real helper does past 31 s of audio;
 * - `hang_on_stop`: ignores `stop`.
 * Cancel sends `cancelled` and closing stdin sends `aborted`.
 * `--locale` is echoed in `ready`, and its absence is `"auto"`.
 *
 * It uses only dynamic `import()` so that it runs as CommonJS or as ESM,
 * whichever the directory it is extracted to implies.
 */
export const FIXTURE_HELPER_SOURCE = `#!/usr/bin/env node
(async () => {
  const { createInterface } = await import('node:readline');
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const sessionId = option('--session-id');
  if (!sessionId) {
    process.stderr.write('missing --session-id\\n');
    process.exit(2);
  }
  const locale = option('--locale') ?? 'auto';
  const scenario = process.env.CATS_STT_FIXTURE_SCENARIO ?? 'final';
  const text = process.env.CATS_STT_FIXTURE_TEXT ?? 'fixture transcript';
  const line = (event) => JSON.stringify({ ...event, sessionId }) + '\\n';
  let finished = false;
  // Exits only once stdout has flushed: pipes can be asynchronous.
  const finish = (events) => {
    if (finished) return;
    finished = true;
    process.stdout.write(events.map(line).join(''), () => process.exit(0));
  };
  if (scenario === 'exit_before_ready') {
    process.exit(1);
  }
  if (scenario === 'mic_unavailable' || scenario === 'engine_unavailable') {
    finish([{ type: 'error', reason: scenario }, { type: 'end' }]);
    return;
  }
  if (scenario !== 'no_ready') {
    process.stdout.write(line({ type: 'ready', locale, mode: 'on-device' }));
  }
  if (scenario === 'overrun') {
    const overrunMs = Number(process.env.CATS_STT_FIXTURE_OVERRUN_MS ?? 50);
    setTimeout(() => finish([{ type: 'error', reason: 'aborted' }, { type: 'end' }]), overrunMs);
  }
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (input) => {
    let command;
    try {
      command = JSON.parse(input);
    } catch {
      return;
    }
    if (command.sessionId !== sessionId) return;
    if (command.type === 'stop' && scenario === 'hang_on_stop') return;
    if (command.type === 'stop') finish([{ type: 'final', text }, { type: 'end' }]);
    if (command.type === 'cancel') {
      finish([{ type: 'error', reason: 'cancelled' }, { type: 'end' }]);
    }
  });
  lines.on('close', () => finish([{ type: 'error', reason: 'aborted' }, { type: 'end' }]));
})();
`;

const encoder = new TextEncoder();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A compressible stand-in for the model, so the deflated variant really shrinks. */
function fixtureModelBytes(size = 64 * 1024) {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = index % 251;
  }
  return bytes;
}

/**
 * The pack's files other than the manifest, keyed by path.
 *
 * @param {{ modelSize?: number }} [options]
 */
export function fixturePackFiles(options = {}) {
  return {
    [FIXTURE_PACK_ENTRY]: { bytes: encoder.encode(FIXTURE_HELPER_SOURCE), executable: true },
    [FIXTURE_MODEL_PATH]: { bytes: fixtureModelBytes(options.modelSize), executable: false },
    'licenses/helper.txt': { bytes: encoder.encode('MIT License (fixture)\n'), executable: false },
    'licenses/models.txt': {
      bytes: encoder.encode('MIT License (model fixture)\n'),
      executable: false,
    },
  };
}

export function fixtureManifest(files, { id, version, arch }) {
  const entries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right));
  return {
    schemaVersion: 1,
    id,
    version,
    os: 'linux',
    arch,
    helperProtocol: 1,
    entry: FIXTURE_PACK_ENTRY,
    files: entries.map(([path, file]) => ({
      path,
      size: file.bytes.length,
      sha256: sha256(file.bytes),
      executable: file.executable,
    })),
    upstream: [{
      name: 'whisper.cpp',
      repository: 'https://github.com/ggml-org/whisper.cpp',
      commit: '0123456789abcdef0123456789abcdef01234567',
    }],
    model: {
      name: 'ggml-fixture',
      path: FIXTURE_MODEL_PATH,
      sha256: sha256(files[FIXTURE_MODEL_PATH].bytes),
    },
    prerequisites: ['libpulse.so.0'],
    minGlibc: '2.35',
    licenses: [
      { name: 'MIT', component: 'cats-stt-linux', path: 'licenses/helper.txt' },
      { name: 'MIT', component: 'ggml-fixture', path: 'licenses/models.txt' },
    ],
    languages: [...FIXTURE_LANGUAGES],
  };
}

/**
 * Replaces an entry name in both its local header and its central record.
 * `from` and `to` must have the same length, and `from` must appear nowhere
 * else, so rename an entry added through `extraFiles`: the manifest's contents
 * name every other path.
 */
export function renameArchiveEntry(bytes, from, to) {
  if (from.length !== to.length) {
    throw new Error('renameArchiveEntry needs names of the same length');
  }
  const result = Buffer.from(bytes);
  const needle = Buffer.from(from, 'latin1');
  const replacement = Buffer.from(to, 'latin1');
  let replaced = 0;
  for (let index = result.indexOf(needle); index >= 0; index = result.indexOf(needle, index + 1)) {
    replacement.copy(result, index);
    replaced += 1;
  }
  if (replaced !== 2) {
    throw new Error(`expected ${from} in one local and one central header; found ${replaced}`);
  }
  return result;
}

/** Writes `zippable` with fflate's streaming `Zip`, as a streaming producer would. */
function zipStreaming(zippable) {
  const chunks = [];
  const zip = new Zip((error, data) => {
    if (error) {
      throw error;
    }
    chunks.push(data);
  });
  for (const [path, [bytes, options]] of Object.entries(zippable)) {
    const file = options.level
      ? new ZipDeflate(path, { level: options.level })
      : new ZipPassThrough(path);
    if (options.os !== undefined) {
      file.os = options.os;
    }
    if (options.attrs !== undefined) {
      file.attrs = options.attrs;
    }
    zip.add(file);
    file.push(bytes, true);
  }
  zip.end();
  return Buffer.concat(chunks);
}

/**
 * @typedef {object} FixturePackOptions
 * @property {string} [id]
 * @property {string} [version]
 * @property {'x64' | 'arm64'} [arch]
 * @property {'stored' | 'deflated'} [compression]
 * @property {'sync' | 'streaming'} [writer]
 * @property {number} [modelSize] The stand-in model's bytes; 64 KiB by default.
 * @property {(manifest: Record<string, any>) => Record<string, any>} [editManifest]
 * @property {Record<string, Uint8Array>} [extraFiles]
 * @property {string[]} [omitFiles]
 * @property {Record<string, { os?: number, attrs?: number }>} [attributes]
 * @property {(bytes: Buffer) => Uint8Array} [patchArchive]
 * @property {(entry: Record<string, any>) => Record<string, any>} [editLockEntry]
 */

/**
 * Finds the end of central directory record and each entry's central and local
 * header offsets, for byte patches inside `patchArchive`.
 *
 * @param {Uint8Array} bytes
 */
export function locateArchiveRecords(bytes) {
  const buffer = Buffer.from(bytes);
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  /** @type {Map<string, { central: number, local: number }>} */
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const name = buffer.toString('latin1', cursor + 46, cursor + 46 + nameLength);
    entries.set(name, { central: cursor, local: buffer.readUInt32LE(cursor + 42) });
    cursor += 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  return { eocd, entries };
}

/**
 * Writes `<id>-<version>-linux-<arch>.catspack` into `directory` and returns it
 * with its lock entry and manifest. Options build the AC-01 defects:
 * - `compression`: `stored` (default) or `deflated`;
 * - `writer`: fflate's `zipSync` (default) or its streaming `Zip`, which writes
 *   data descriptors (bit 3) and zero sizes in the local headers;
 * - `editManifest(manifest)`: changes the manifest before it is archived;
 * - `extraFiles`: `{ path: bytes }` archived but left out of the manifest;
 * - `omitFiles`: manifest paths left out of the archive;
 * - `attributes`: `{ path: { os, attrs } }` fflate attributes per entry;
 * - `patchArchive(bytes)`: byte edits fflate cannot express;
 * - `editLockEntry(entry)`: changes the lock entry after hashing.
 *
 * @param {string} directory
 * @param {FixturePackOptions} [options]
 */
export async function buildFixturePack(directory, options = {}) {
  const {
    id = FIXTURE_PACK_ID,
    version = '1.0.0',
    arch = 'x64',
    compression = 'stored',
    writer = 'sync',
    modelSize,
    editManifest = (manifest) => manifest,
    extraFiles = {},
    omitFiles = [],
    attributes = {},
    patchArchive = (bytes) => bytes,
    editLockEntry = (entry) => entry,
  } = options;
  const files = fixturePackFiles({ modelSize });
  const manifest = editManifest(fixtureManifest(files, { id, version, arch }));
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);

  const level = compression === 'deflated' ? 6 : 0;
  /** @type {Record<string, [Uint8Array, object]>} */
  const zippable = { 'feature-pack.json': [manifestBytes, { level }] };
  for (const [path, file] of Object.entries(files)) {
    if (!omitFiles.includes(path)) {
      zippable[path] = [file.bytes, { level, ...attributes[path] }];
    }
  }
  for (const [path, bytes] of Object.entries(extraFiles)) {
    zippable[path] = [bytes, { level, ...attributes[path] }];
  }
  const zipped = writer === 'streaming' ? zipStreaming(zippable) : zipSync(zippable);
  const archiveBytes = Buffer.from(patchArchive(Buffer.from(zipped)));

  const archiveName = `${id}-${version}-linux-${arch}.catspack`;
  const archivePath = join(directory, archiveName);
  await writeFile(archivePath, archiveBytes);

  const unpackedSize = Object.values(zippable)
    .reduce((total, [bytes]) => total + bytes.length, 0);
  const lockEntry = editLockEntry({
    id,
    version,
    minUsableVersion: version,
    os: 'linux',
    arch,
    url: `https://example.invalid/releases/${archiveName}`,
    size: archiveBytes.length,
    sha256: sha256(archiveBytes),
    unpackedSize,
    helperProtocol: 1,
    minGlibc: '2.35',
    prerequisites: ['libpulse.so.0'],
    licenses: manifest.licenses.map(({ name, component }) => ({ name, component })),
  });
  return { archivePath, archiveBytes, lockEntry, manifest };
}

export function fixtureLock(packs) {
  return { schemaVersion: 1, packs };
}

/**
 * Streams `bytes` in chunks, as a transport body (SPEC-145 FR-B3). It yields
 * to the event loop between chunks, stops when `signal` aborts, can drop the
 * connection after `failAfter` bytes, and calls `onChunk` once the consumer
 * has taken each chunk. With `endOnAbort`, an abort ends the body quietly, as
 * some transports do, instead of throwing.
 *
 * @param {Uint8Array} bytes
 * @param {AbortSignal | undefined} signal
 * @param {{ chunkSize?: number, failAfter?: number, endOnAbort?: boolean,
 *   onChunk?: (sent: number) => void }} [options]
 */
export async function* fixtureBody(bytes, signal, options = {}) {
  const { chunkSize = 16 * 1024, failAfter, endOnAbort = false, onChunk } = options;
  let sent = 0;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    await new Promise((resolve) => setImmediate(resolve));
    if (signal?.aborted && endOnAbort) {
      return;
    }
    signal?.throwIfAborted();
    if (failAfter !== undefined && sent >= failAfter) {
      throw new Error('fixture connection reset');
    }
    const chunk = bytes.subarray(offset, offset + chunkSize);
    sent += chunk.length;
    yield chunk;
    onChunk?.(sent);
  }
}

/**
 * Answers like a release asset host: 206 for `Range: bytes=N-`, 200 otherwise,
 * or 200 for both with `ignoreRange`.
 *
 * @param {Uint8Array | undefined} bytes
 * @param {Record<string, string>} headers
 * @param {AbortSignal | undefined} signal
 * @param {{ ignoreRange?: boolean, chunkSize?: number, failAfter?: number,
 *   endOnAbort?: boolean, onChunk?: (sent: number) => void }} [options]
 */
export function serveArchive(bytes, headers, signal, options = {}) {
  if (!bytes) {
    return { status: 404, headers: {}, body: fixtureBody(new Uint8Array(0), signal) };
  }
  const match = /^bytes=(\d+)-$/u.exec(headers.range ?? '');
  if (match && !options.ignoreRange) {
    const start = Number(match[1]);
    return {
      status: 206,
      headers: {
        'content-range': `bytes ${start}-${bytes.length - 1}/${bytes.length}`,
        'content-length': String(bytes.length - start),
      },
      body: fixtureBody(bytes.subarray(start), signal, options),
    };
  }
  return {
    status: 200,
    headers: { 'content-length': String(bytes.length) },
    body: fixtureBody(bytes, signal, options),
  };
}

/**
 * @typedef {object} FixtureTransportRequest
 * @property {string} url
 * @property {Record<string, string>} headers
 * @property {AbortSignal} signal
 */

/**
 * An in-memory pack transport. It serves `archives` by URL through
 * `serveArchive`, records every request, and answers the next request with a
 * handler queued by `respondOnce`. Like the product transport, it never follows
 * redirects.
 *
 * @param {Map<string, Uint8Array>} archives
 */
export function createFixtureTransport(archives) {
  /** @type {Array<{ url: string, headers: Record<string, string> }>} */
  const requests = [];
  /** @type {Array<(request: FixtureTransportRequest) => any>} */
  const queued = [];
  return {
    requests,
    /** @param {(request: FixtureTransportRequest) => any} handler */
    respondOnce(handler) {
      queued.push(handler);
    },
    /** @param {FixtureTransportRequest} request */
    async request(request) {
      requests.push({ url: request.url, headers: { ...request.headers } });
      const handler = queued.shift();
      if (handler) {
        return handler(request);
      }
      return serveArchive(archives.get(request.url), request.headers, request.signal);
    },
  };
}
