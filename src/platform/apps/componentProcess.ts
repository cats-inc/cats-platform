import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentRunnerUrl } from '#cats-app-package';

export interface AppProcessContext {
  appId: string;
  componentId: string;
  dataDir: string;
  services: Record<string, { url: string; headers: Record<string, string> }>;
  fromSchemaVersion?: number;
  toSchemaVersion?: number;
  ingress?: { authtoken: string; target: string; url?: string };
}

export interface AppProcess {
  child: ChildProcess;
  url?: string;
  key: string;
  publicUrl?: string;
  stop(): Promise<void>;
}

export async function startAppProcess(options: {
  entrypoint: string; kind: 'service' | 'worker' | 'migration' | 'ingress'; context: AppProcessContext;
  timeoutMs?: number; onExit?: () => void;
}): Promise<AppProcess> {
  const key = randomBytes(32).toString('hex');
  // Explicit environment: Apps do not inherit provider credentials, host auth or NODE_OPTIONS.
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  env.CATS_APP_COMPONENT = JSON.stringify({ entrypoint: options.entrypoint, kind: options.kind,
    key, context: options.context });
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  const child = spawn(process.execPath, ['--max-old-space-size=192', fileURLToPath(componentRunnerUrl)], {
    cwd: path.dirname(options.entrypoint), env, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout?.resume(); child.stderr?.resume();
  let stopping = false;
  const exited = new Promise<void>(resolve => child.once('close', () => {
    resolve(); if (!stopping) options.onExit?.();
  }));
  const stop = async () => {
    if (stopping) return exited;
    stopping = true;
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (child.connected) child.send({ type: 'stop' }, () => {});
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 3500);
    try { await exited; } finally { clearTimeout(timer); }
  };
  try {
    const ready = await new Promise<{ port?: number; publicUrl?: string }>((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('App component readiness timed out.')), options.timeoutMs ?? 15_000);
      const error = () => done(new Error('App component failed to start.'));
      const message = (value: unknown) => {
        const data = value as { type?: string; port?: number; publicUrl?: string };
        if (data?.type === 'failed') return error();
        if (data?.type === (options.kind === 'migration' ? 'migrated' : 'ready')) {
          if (options.kind === 'service' && (!Number.isInteger(data.port) || data.port! < 1 || data.port! > 65535)) return error();
          done(undefined, data);
        }
      };
      const done = (failure?: Error, data: { port?: number; publicUrl?: string } = {}) => {
        clearTimeout(timer); child.off('error', error); child.off('exit', error); child.off('message', message);
        failure ? reject(failure) : resolve(data);
      };
      child.once('error', error); child.once('exit', error); child.on('message', message);
    });
    return { child, key, ...(ready.port ? { url: `http://127.0.0.1:${ready.port}` } : {}), publicUrl: ready.publicUrl, stop };
  } catch (error) { await stop(); throw error; }
}
