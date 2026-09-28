import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { acquirePluginWriter } from './writer.js';
import type { RuntimeClient, RuntimeSessionCreateInput, RuntimeSendMessageInput } from '../../runtime/client.js';
import { AGENCY_PLUGIN, type PluginIdentity, type PluginInventory, type PluginObservation } from '../../shared/managedPlugins.js';

interface State {
  schema: 1; hostId: string; runtimeId?: string; revision: number; generation: number;
  installed: boolean; desired: PluginInventory['desired']; phase: PluginInventory['phase'];
  confirmedSessions: string[]; confirmedRuns: string[];
  conversations: Record<string, number>;
  sessions: Record<string, string>;
  managedSessions: Record<string, number>;
}
export interface PluginRuntimePort { request(method: string, path: string, body?: unknown): Promise<PluginObservation> }
export function createPluginRuntimePort(baseUrl: string, key: string): PluginRuntimePort {
  return { async request(method, path, body) {
    const url = new URL(baseUrl);
    if (!key || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Plugins require an authenticated local Runtime.');
    const response = await fetch(`${baseUrl}/plugins/managed${path}`, {
      method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    const result = await response.json() as PluginObservation & { error?: string };
    if (!response.ok) throw new Error(result.error ?? `Runtime HTTP ${response.status}`);
    if (result.protocol !== 1 || typeof result.runtimeId !== 'string' || !Array.isArray(result.affectedSessions) || !Array.isArray(result.pendingRuns)) throw new Error('Unsupported Plugin management response.');
    return result;
  } };
}
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function inspectAgencyPackage(bytes: Uint8Array) {
  // Check the entire reviewed archive before decoding. No arbitrary ZIP, paths,
  // manifest trust assertions, hooks or executable capabilities are admitted.
  if (bytes.byteLength !== 40_832 || sha256(bytes) !== AGENCY_PLUGIN.digest) throw new Error('Only the reviewed Agency Agents 0.1.0 artifact is accepted.');
  const files = unzipSync(bytes);
  return AGENCY_PLUGIN.skills.map(skill => ({ id: skill.id, markdown: Buffer.from(files[skill.entry]).toString('utf8') }));
}
function assertUnlinked(path: string): void {
  let current = resolve(path);
  for (;;) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Plugin storage cannot use symbolic links or junctions.');
    const parent = dirname(current); if (parent === current) return; current = parent;
  }
}
export class ManagedPluginManager {
  private readonly directory: string;
  private readonly stateFile: string;
  private readonly archive: string;
  private queue: Promise<unknown> = Promise.resolve();
  private observation: PluginObservation | null = null;
  private error?: string;
  constructor(platformDir: string, readonly policyEnabled: boolean, private readonly runtime: PluginRuntimePort) {
    this.directory = join(platformDir, 'plugins');
    this.stateFile = join(this.directory, 'state.json');
    this.archive = join(this.directory, 'packages', `${AGENCY_PLUGIN.digest}.catsplugin`);
  }
  private read(): State {
    if (!existsSync(this.stateFile)) return { schema: 1, hostId: randomUUID(), revision: 0, generation: 0, installed: false, desired: 'removed', phase: 'absent', confirmedSessions: [], confirmedRuns: [], conversations: {}, sessions: {}, managedSessions: {} };
    assertUnlinked(this.stateFile);
    const state = JSON.parse(readFileSync(this.stateFile, 'utf8')) as State;
    if (state.schema !== 1 || !/^[a-zA-Z0-9-]{16,80}$/.test(state.hostId) || !Number.isSafeInteger(state.revision)
      || !Number.isSafeInteger(state.generation) || typeof state.installed !== 'boolean'
      || !['enabled', 'disabled', 'removed'].includes(state.desired)
      || !['absent', 'installed', 'registering', 'enabled', 'fencing', 'confirmation-required', 'stop-pending', 'disabled'].includes(state.phase)
      || !Array.isArray(state.confirmedSessions) || !Array.isArray(state.confirmedRuns) || !state.conversations || !state.sessions || !state.managedSessions) throw new Error('Plugin inventory requires recovery; existing data was preserved.');
    return state;
  }
  private save(state: State): void {
    assertUnlinked(this.directory); mkdirSync(this.directory, { recursive: true });
    const lock = join(this.directory, 'writer.lock');
    const release = acquirePluginWriter(lock); const temp = join(this.directory, `${randomUUID()}.tmp`);
    try {
      if (this.read().revision !== state.revision) throw new Error('Plugin inventory changed; refresh before retrying.');
      const out = openSync(temp, 'wx');
      try { writeFileSync(out, JSON.stringify({ ...state, revision: state.revision + 1 })); fsyncSync(out); } finally { closeSync(out); }
      renameSync(temp, this.stateFile); state.revision += 1;
    } finally { if (existsSync(temp)) unlinkSync(temp); release(); }
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn); this.queue = result.catch(() => {}); return result;
  }
  private requirePolicy(): void { if (!this.policyEnabled) throw new Error('Enable an isolated internal experiment profile to manage Plugins.'); }
  /** Conversation receipts prevent automatic transcript replay into a new Runtime
   * UUID from laundering revoked Plugin exposure after a Cat/profile change. */
  wrapClient(client: RuntimeClient): RuntimeClient {
    const manager = this;
    const channelKey = (channel: unknown) => typeof channel === 'string' ? sha256(Buffer.from(channel)) : undefined;
    async function admit(input?: RuntimeSendMessageInput, sessionId?: string): Promise<{ key?: string; generation?: number }> {
      return manager.serial(async () => {
        const state = manager.read();
        const key = channelKey(input?.context?.metadata?.channelId) ?? (sessionId ? state.sessions[sessionId] : undefined);
        const requested = input?.skills?.requestedSkills.some(ref => (typeof ref === 'string' ? ref : ref.id ?? '').startsWith('plugin:'));
        const prior = key ? state.conversations[key] : undefined;
        if (!requested && prior === undefined) return { key };
        if (!key) throw new Error('Managed Plugin skills require a Cats conversation.');
        if (prior !== undefined && !requested && (!sessionId || state.managedSessions[sessionId] !== prior)) throw new Error('Plugin conversation replay requires managed skills. Start a new conversation to change profiles.');
        if (!manager.inventory().availableSkills.length || (prior !== undefined && prior !== state.generation)) throw new Error('This conversation contains an unavailable Plugin context. Start a new conversation without replaying its history.');
        if (prior === undefined) { state.conversations[key] = state.generation; manager.save(state); }
        return { key, generation: state.generation };
      });
    }
    return new Proxy(client, { get(target, property) {
      if (property === 'createSession') return async (input: RuntimeSessionCreateInput) => {
        const { key, generation } = await admit(input);
        const session = await target.createSession(input);
        if (key && manager.policyEnabled) await manager.serial(async () => {
          const state = manager.read(); state.sessions[session.id] = key;
          if (generation !== undefined) state.managedSessions[session.id] = generation;
          manager.save(state);
        });
        return session;
      };
      if (property === 'sendMessage') return async (id: string, content: string, input?: RuntimeSendMessageInput) => {
        await admit(input, id); return target.sendMessage(id, content, input);
      };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  private identity(state: State): PluginIdentity {
    return { hostId: state.hostId, id: AGENCY_PLUGIN.id, version: AGENCY_PLUGIN.version, digest: AGENCY_PLUGIN.digest, generation: state.generation };
  }
  private async observe(state: State): Promise<PluginObservation> {
    const observed = await this.runtime.request('GET', '');
    if (state.runtimeId && state.runtimeId !== observed.runtimeId) throw new Error('Runtime identity changed; keep this installation for recovery.');
    if (observed.plugin && observed.plugin.hostId !== state.hostId) throw new Error('Runtime belongs to another Platform Plugin profile.');
    this.observation = observed; this.error = undefined;
    return observed;
  }
  inventory(): PluginInventory {
    const state = this.read();
    const enabled = this.policyEnabled && state.desired === 'enabled' && state.phase === 'enabled'
      && this.observation?.plugin?.enabled && this.observation.plugin.leaseUntil > Date.now()
      && this.observation.plugin.generation === state.generation;
    return { policyEnabled: this.policyEnabled, revision: state.revision, installed: state.installed, desired: state.desired,
      phase: state.phase, observation: this.observation, error: this.error,
      availableSkills: enabled ? AGENCY_PLUGIN.skills.map(({ id, title }) => ({ id, title })) : [] };
  }
  inspect(bytes: Uint8Array): typeof AGENCY_PLUGIN { this.requirePolicy(); inspectAgencyPackage(bytes); return AGENCY_PLUGIN; }
  install(bytes: Uint8Array, revision: number): Promise<PluginInventory> {
    return this.serial(async () => {
      this.requirePolicy(); inspectAgencyPackage(bytes); const state = this.read();
      if (state.revision !== revision || state.installed) throw new Error('Refresh inventory before installing.');
      assertUnlinked(this.archive); mkdirSync(dirname(this.archive), { recursive: true });
      if (!existsSync(this.archive)) {
        const temporary = join(dirname(this.archive), `${randomUUID()}.tmp`);
        const fd = openSync(temporary, 'wx'); try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
        renameSync(temporary, this.archive);
      } else inspectAgencyPackage(readFileSync(this.archive));
      state.installed = true; state.desired = 'disabled'; state.phase = 'installed'; this.save(state);
      return this.inventory();
    });
  }
  enable(revision: number): Promise<PluginInventory> {
    return this.serial(async () => {
      this.requirePolicy(); const state = this.read();
      if (!state.installed || state.revision !== revision || ['fencing', 'stop-pending', 'confirmation-required'].includes(state.phase)) throw new Error('Refresh or finish removal before enabling.');
      assertUnlinked(this.archive); const skills = inspectAgencyPackage(readFileSync(this.archive));
      const observed = await this.observe(state);
      if (observed.pendingRuns.length) throw new Error('Prior Plugin work still requires stop confirmation.');
      state.runtimeId = observed.runtimeId; state.generation = Math.max(state.generation, observed.plugin?.generation ?? 0) + 1;
      state.desired = 'enabled'; state.phase = 'registering'; this.save(state);
      try {
        this.observation = await this.runtime.request('PUT', '', { protocol: 1, ...this.identity(state), enabled: true, skills });
        state.phase = 'enabled'; this.save(state); this.error = undefined;
      } catch (error) { this.error = String(error); }
      return this.inventory();
    });
  }
  async impact(): Promise<PluginInventory> {
    return this.serial(async () => {
      this.requirePolicy();
      try { await this.observe(this.read()); } catch (error) { this.observation = null; this.error = String(error); }
      return this.inventory();
    });
  }
  disable(input: { revision: number; remove: boolean; confirmedSessions: string[]; confirmedRuns: string[] }): Promise<PluginInventory> {
    return this.serial(async () => {
      this.requirePolicy(); const state = this.read();
      if (!state.installed || input.revision !== state.revision) throw new Error('Refresh inventory before changing this installation.');
      if (state.desired === 'enabled' || state.phase === 'installed' || state.phase === 'disabled') state.generation += 1;
      state.desired = input.remove ? 'removed' : 'disabled'; state.phase = 'fencing';
      state.confirmedSessions = input.confirmedSessions; state.confirmedRuns = input.confirmedRuns;
      this.save(state); await this.reconcileRemoval(state); return this.inventory();
    });
  }
  private async reconcileRemoval(state: State): Promise<void> {
    try {
      const observed = await this.observe(state);
      if (!state.runtimeId) { state.runtimeId = observed.runtimeId; this.save(state); }
      // A rejected/stale descriptor cannot be hidden by a successful local cleanup.
      this.observation = await this.runtime.request('PUT', '', { protocol: 1, ...this.identity(state), enabled: false, skills: [] });
      if (this.observation.affectedSessions.some(id => !state.confirmedSessions.includes(id))
        || this.observation.pendingRuns.some(run => !state.confirmedRuns.includes(run.runId))) {
        state.phase = 'confirmation-required'; this.save(state); return;
      }
      this.observation = await this.runtime.request('POST', '/stop', { ...this.identity(state), confirmedSessions: state.confirmedSessions, confirmedRuns: state.confirmedRuns });
      state.phase = this.observation.pendingRuns.length ? 'stop-pending' : 'disabled';
      if (state.phase === 'disabled' && state.desired === 'removed') {
        assertUnlinked(this.archive);
        if (existsSync(this.archive)) { inspectAgencyPackage(readFileSync(this.archive)); unlinkSync(this.archive); }
        state.installed = false; state.phase = 'absent';
      }
      this.error = undefined; this.save(state);
    } catch (error) { this.observation = null; this.error = String(error); }
  }
  tick(): Promise<void> {
    return this.serial(async () => {
      if (!this.policyEnabled) return;
      const state = this.read(); if (!state.installed) return;
      if (state.desired !== 'enabled' && ['fencing', 'stop-pending'].includes(state.phase)) return this.reconcileRemoval(state);
      if (state.desired !== 'enabled') return;
      try {
        await this.observe(state);
        this.observation = await this.runtime.request('POST', '/renew', this.identity(state));
        if (state.phase !== 'enabled') { state.phase = 'enabled'; this.save(state); }
      } catch (error) { this.observation = null; this.error = String(error); }
    });
  }
}
