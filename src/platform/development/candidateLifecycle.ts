import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readCandidateOwnership, type CandidateOwnership } from './candidateOwnership.js';

export interface CandidateLifecycleObservation {
  launchId: string;
  instanceId: string;
  hostPid: number;
  state: 'running' | 'stopping' | 'drained' | 'failed' | 'unconfirmed';
  observedAt: string;
  instanceBoundStop: boolean;
  stopRequestedAt?: string;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = (value: unknown, length: number): value is string => typeof value === 'string'
  && new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value);
const samePath = (left: string, right: string) => process.platform === 'win32'
  ? left.toLowerCase() === right.toLowerCase() : left === right;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('candidate_invalid_control');
  return value as Record<string, unknown>;
}
async function json(file: string): Promise<Record<string, unknown>> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !samePath(await realpath(file), file)) throw new Error('candidate_invalid_control');
  const handle = await open(file, 'r');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > 256 * 1024
      || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error('candidate_invalid_control');
    const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(256 * 1024 + 1) });
    if (bytesRead > 256 * 1024) throw new Error('candidate_invalid_control');
    const current = await lstat(file);
    if (current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino) throw new Error('candidate_invalid_control');
    return record(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')));
  } finally { await handle.close(); }
}
async function responseJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new Error('candidate_unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > 64 * 1024) throw new Error('candidate_invalid_control');
      chunks.push(next.value);
    }
    return record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally { await reader.cancel().catch(() => undefined); }
}

/** Operates only a Core-prepared candidate; never builds, kills PIDs or removes files. */
export async function operateOwnedCandidate(input: {
  ownership: CandidateOwnership;
  action: 'status' | 'stop';
  expected?: Pick<CandidateLifecycleObservation, 'launchId' | 'instanceId' | 'hostPid'>;
  beforeStop(observation: CandidateLifecycleObservation): Promise<void>;
}): Promise<CandidateLifecycleObservation> {
  const ownership = readCandidateOwnership(input.ownership);
  if (!['status', 'stop'].includes(input.action)) throw new Error('invalid_candidate_request');
  const root = await realpath(ownership.root);
  const readControl = async () => {
    const directory = await lstat(ownership.root);
    if (!directory.isDirectory() || directory.isSymbolicLink() || !samePath(root, ownership.root)
      || !samePath(await realpath(ownership.root), root)) throw new Error('candidate_source_boundary');
    const launch = await json(path.join(root, 'launch.json'));
    const control = await json(path.join(root, 'control.json'));
    if (launch.schemaVersion !== 1 || control.schemaVersion !== 1 || launch.root !== root || control.root !== root
      || hash(readCandidateOwnership(launch.ownership)) !== hash(ownership)
      || !hex(control.token, 64) || createHash('sha256').update(control.token).digest('hex') !== launch.launchId
      || control.launchId !== launch.launchId || !hex(control.instanceId, 32)
      || !Number.isSafeInteger(control.pid) || Number(control.pid) < 1
      || typeof control.url !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(control.url)
      || Number(new URL(control.url).port) > 65535
      || (input.expected && (control.launchId !== input.expected.launchId || control.instanceId !== input.expected.instanceId
        || control.pid !== input.expected.hostPid))) {
      throw new Error('candidate_identity_mismatch');
    }
    return control as Record<string, unknown> & { token: string; url: string; launchId: string; instanceId: string };
  };
  const control = await readControl();
  const observation = (state: CandidateLifecycleObservation['state'], instanceBoundStop = false): CandidateLifecycleObservation => ({
    launchId: control.launchId, instanceId: control.instanceId, hostPid: Number(control.pid), state, observedAt: new Date().toISOString(), instanceBoundStop,
  });
  const identity = (value: Record<string, unknown>) => {
    if (value.root !== root || value.launchId !== control.launchId || value.instanceId !== control.instanceId
      || value.pid !== control.pid) throw new Error('candidate_identity_mismatch');
  };
  const exitReceipt = async (): Promise<CandidateLifecycleObservation | null> => {
    let receipt;
    try { receipt = await json(path.join(root, `exit-${control.instanceId}.json`)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    identity(receipt);
    if (receipt.schemaVersion !== 1 || !Number.isSafeInteger(receipt.exitCode)
      || typeof receipt.drainedAt !== 'string' || !Number.isFinite(Date.parse(receipt.drainedAt))) throw new Error('candidate_invalid_control');
    return observation(receipt.exitCode === 0 ? 'drained' : 'failed');
  };
  const recheck = async () => {
    if (hash(await readControl()) !== hash(control)) throw new Error('candidate_changed');
  };
  const request = (route: 'status' | 'stop-instance', method = 'GET') => fetch(`${control.url}/${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${control.token}`, 'X-Cats-Instance-Id': control.instanceId },
  }).then(responseJson);
  const exited = await exitReceipt();
  if (exited) { await recheck(); return exited; }
  let status: Record<string, unknown>;
  try { status = await request('status'); }
  catch {
    const settled = await exitReceipt(); await recheck();
    return settled ?? observation('unconfirmed');
  }
  identity(status); await recheck();
  const observed = observation(status.stopping === true ? 'stopping' : 'running', status.instanceBoundStop === true);
  if (input.action === 'status') return observed;
  if (!observed.instanceBoundStop) throw new Error('candidate_control_upgrade_required');
  // All filesystem I/O precedes the final atomic Core admission. The next I/O
  // is the already instance-bound POST; no post-admission filesystem gap.
  await input.beforeStop(observed);
  let accepted = false;
  try { accepted = (await request('stop-instance', 'POST')).stopping === true; }
  catch { /* A lost response cannot establish whether stop was accepted. Never retry here. */ }
  const settled = await exitReceipt(); await recheck();
  return settled ?? observation(accepted ? 'stopping' : 'unconfirmed', true);
}
