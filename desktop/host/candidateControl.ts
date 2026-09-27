import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import type { CandidateScreenshot } from './candidateInteraction.js';
import { assertDesktopCandidatePaths, type DesktopCandidateProfile } from './candidateProfile.js';

/** Finish any already-admitted startup before draining; rejection still drains. */
export async function settleDesktopCandidateStartup(startup: Promise<unknown> | null): Promise<void> {
  await startup?.catch(() => undefined);
}

/** Developer-only control of this candidate; never installed on a normal launch. */
export async function startDesktopCandidateControl(input: {
  profile: DesktopCandidateProfile;
  token: string;
  status(): object;
  screenshot(): Promise<CandidateScreenshot>;
  input(action: unknown): Promise<void>;
  invalidate(): void;
  stop(): void;
}): Promise<{ revoke(): void; close(exitCode: number): Promise<void> }> {
  if (!/^[a-f0-9]{64}$/u.test(input.token)) throw new Error('Invalid candidate control token.');
  assertDesktopCandidatePaths(input.profile);
  const secret = Buffer.from(`Bearer ${input.token}`);
  const launchId = createHash('sha256').update(input.token).digest('hex');
  const instanceId = randomBytes(16).toString('hex');
  let stopping = false;
  const revoke = () => { stopping = true; input.invalidate(); };
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const authorization = Buffer.from(req.headers.authorization ?? '');
    if (req.headers.origin !== undefined || authorization.length !== secret.length
      || !timingSafeEqual(authorization, secret)) {
      res.writeHead(403).end();
      return;
    }
    const json = (value: object) => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
    };
    if (req.method === 'GET' && req.url === '/status') {
      json({ pid: process.pid, root: input.profile.root, launchId, instanceId, stopping, ...input.status(), instanceBoundStop: true });
    } else if (req.method === 'POST' && (req.url === '/stop' || req.url === '/stop-instance')) {
      if (req.url === '/stop-instance' && req.headers['x-cats-instance-id'] !== instanceId) {
        res.writeHead(409).end('Candidate instance changed.'); return;
      }
      json({ stopping: true });
      if (!stopping) {
        revoke();
        setImmediate(input.stop);
      }
    } else if (req.method === 'POST' && req.url === '/screenshot' && !stopping) {
      void input.screenshot().then((shot) => {
        if (stopping) throw new Error('Candidate stopping.');
        res.writeHead(200, { 'Content-Type': 'image/png',
          'X-Cats-Frame-Id': shot.frameId, 'X-Cats-Instance-Id': instanceId,
          'X-Cats-Image-Width': shot.width, 'X-Cats-Image-Height': shot.height }).end(shot.png);
      }).catch(() => res.writeHead(409).end('Candidate window is unavailable.'));
    } else if (req.method === 'POST' && req.url === '/input' && !stopping) {
      // Bound buffered JSON even for chunked requests; never log input text.
      if (!/^application\/json(?:;|$)/iu.test(req.headers['content-type'] ?? '')) {
        res.writeHead(415).end();
        req.resume();
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      req.setTimeout(5000, () => req.destroy());
      req.on('error', () => { if (!res.writableEnded) res.writeHead(400).end(); });
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 32 * 1024) {
          chunks.length = 0;
          if (!res.writableEnded) res.writeHead(413).end();
        } else chunks.push(chunk);
      });
      req.on('end', () => {
        req.setTimeout(0);
        if (res.writableEnded) return;
        let action: unknown;
        try { action = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { res.writeHead(400).end(); return; }
        if (stopping || !action || typeof action !== 'object'
          || (action as { instanceId?: unknown }).instanceId !== instanceId) {
          res.writeHead(409).end('Candidate instance changed or is stopping.');
          return;
        }
        void input.input(action).then(() => json({ input: 'applied', instanceId, launchId }))
          .catch(() => res.writeHead(409).end('Input outcome unconfirmed; inspect a new screenshot before deciding whether to retry.'));
      });
    } else {
      res.writeHead(404).end();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Candidate control has no address.');
  const receipt = {
    schemaVersion: 1,
    launchId,
    instanceId,
    root: input.profile.root,
    pid: process.pid,
    token: input.token,
    url: `http://127.0.0.1:${address.port}`,
  };
  try {
    await writeReceipt('control', receipt);
  } catch (error) {
    server.close();
    throw error;
  }
  async function writeReceipt(name: string, value: object): Promise<void> {
    assertDesktopCandidatePaths(input.profile);
    const target = join(input.profile.root, `${name}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  }
  return {
    revoke,
    async close(exitCode) {
      revoke();
      // Called after the host's normal sidecar drain, before the host exits.
      await writeReceipt(`exit-${instanceId}`, { schemaVersion: 1, pid: process.pid, launchId,
        instanceId, root: input.profile.root, drainedAt: new Date().toISOString(), exitCode, ...input.status() });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
