import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { canonical, digest, fields, integer, physical, safeText, writeNew } from './artifacts.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const DATE = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/u;
const incomplete = () => ({ scope: 'container-exit', status: 'incomplete', evidenceRefs: ['container:unconfirmed'] });
// Whole inspect objects may contain credentials, environment, command text or logs.
const PROJECTION = '{' + [
  ...['Id', 'Image', 'Created', 'RestartCount'].map(key => `"${key}":{{json .${key}}}`),
  '"Config":{"User":{{json .Config.User}},"Labels":{"cats.knowledge.owner":{{json (index .Config.Labels "cats.knowledge.owner")}}}}',
  '"HostConfig":{' + ['Privileged', 'ReadonlyRootfs', 'PidMode', 'IpcMode', 'CgroupnsMode', 'NetworkMode',
    'AutoRemove', 'CapDrop', 'CapAdd', 'SecurityOpt', 'RestartPolicy'].map(key => `"${key}":{{json .HostConfig.${key}}}`).join(',') + '}',
  '"State":{' + ['Status', 'Running', 'Paused', 'Restarting', 'OOMKilled', 'Dead', 'Pid', 'ExitCode', 'StartedAt', 'FinishedAt']
    .map(key => `"${key}":{{json .State.${key}}}`).join(',') + ',"ErrorEmpty":{{eq .State.Error ""}}}',
  '"Mounts":[{{range $i, $m := .Mounts}}{{if $i}},{{end}}{' + ['Type','Source','Destination','RW','Propagation']
    .map(key => `"${key}":{{json $m.${key}}}`).join(',') + '}{{end}}]',
].join(',') + '}';

/** Read-only local Docker transport. No discovery, container mutations or retries. */
export function createDockerReadClient({ executable, configRoot, host, cwd }) {
  for (const value of [executable, configRoot, cwd]) assert.ok(isAbsolute(value));
  assert.ok(/^npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9._-]+$/u.test(host) || /^unix:\/\/[\w/.-]+$/u.test(host),
    'An explicit local daemon endpoint is required.');
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => /^(path|pathext|systemroot|windir|systemdrive|comspec|temp|tmp)$/iu.test(key)));
  const pendingChildren = new Set(); let unavailable = false;
  async function command(args) {
    assert.equal(unavailable, false, 'Docker observation unavailable.');
    return new Promise((resolve, reject) => {
      const child = spawn(executable, ['--config', configRoot, '--host', host, ...args],
        { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks = []; let bytes = 0, failed = false, exited = false, settled = false, escalation, terminal;
      const timeout = setTimeout(terminate, 5_000);
      function finish(code) {
        if (settled) return; settled = true;
        clearTimeout(timeout); clearTimeout(escalation); clearTimeout(terminal);
        if (code !== 0 || failed) {
          child.stdout.destroy(); child.stderr.destroy(); reject(new Error('Docker observation unavailable.'));
        } else resolve(Buffer.concat(chunks).toString('utf8').trim());
      }
      function terminate() {
        if (failed || settled) return; failed = true; clearTimeout(timeout);
        if (exited || !child.pid) { finish(null); return; }
        pendingChildren.add(child);
        try { child.kill(); } catch { /* Still track until exit or terminal deadline. */ }
        escalation = setTimeout(() => { if (!exited) { try { child.kill('SIGKILL'); } catch { /* Remains unconfirmed. */ } } }, 250);
        terminal = setTimeout(() => {
          if (!exited) { unavailable = true; child.unref(); }
          finish(null);
        }, 1_000);
      }
      child.stdout.on('data', chunk => {
        if (failed || settled) return;
        bytes += chunk.length;
        if (bytes > 128 * 1024) terminate(); else chunks.push(chunk);
      });
      // Diagnostics can contain arbitrary daemon text; never retain or expose it.
      child.stderr.on('data', chunk => { if (!failed && !settled) { bytes += chunk.length; if (bytes > 128 * 1024) terminate(); } });
      child.on('error', () => { if (!child.pid) { failed = true; finish(null); } else terminate(); });
      child.once('exit', () => { exited = true; pendingChildren.delete(child); if (failed) finish(null); });
      child.once('close', code => {
        exited = true; pendingChildren.delete(child); finish(code);
      });
    });
  }
  return { inspectTransport: () => ({ unavailable, pendingCliPids: [...pendingChildren].map(child => child.pid) }),
    async inspect(containerId) {
    assert.match(containerId, HASH);
    const engineId = await command(['info', '--format', '{{.ID}}']);
    const container = JSON.parse(await command(['container', 'inspect', '--format', PROJECTION, containerId]));
    assert.equal(engineId, await command(['info', '--format', '{{.ID}}']));
    return { engineId, container };
    } };
}

function validateBinding(raw) {
  const binding = structuredClone(raw);
  fields(binding, ['engineId', 'containerId', 'imageId', 'ownerToken', 'networkMode', 'mounts']);
  safeText(binding.engineId, 100); assert.match(binding.containerId, HASH);
  assert.match(binding.imageId, /^sha256:[a-f0-9]{64}$/u); assert.match(binding.ownerToken, UUID);
  assert.ok(binding.networkMode === 'none' || HASH.test(binding.networkMode), 'Pin a dedicated network ID or none.');
  assert.ok(Array.isArray(binding.mounts) && binding.mounts.length <= 8);
  for (const mount of binding.mounts) {
    fields(mount, ['source', 'destination']);
    assert.ok(typeof mount.source === 'string' && mount.source.length <= 4096 && isAbsolute(mount.source));
    assert.ok(typeof mount.destination === 'string' && /^\/[a-zA-Z0-9/._-]+$/u.test(mount.destination));
  }
  assert.equal(new Set(binding.mounts.map(mount => mount.destination)).size, binding.mounts.length);
  return binding;
}

function observedSnapshot(raw, binding) {
  const c = raw.container, h = c.HostConfig, s = c.State;
  assert.equal(raw.engineId, binding.engineId); assert.equal(c.Id, binding.containerId); assert.equal(c.Image, binding.imageId);
  assert.equal(c.Config.Labels?.['cats.knowledge.owner'], binding.ownerToken);
  assert.equal(c.Config.User, '65534:65534'); assert.equal(h.Privileged, false); assert.equal(h.ReadonlyRootfs, true);
  assert.equal(h.PidMode, ''); assert.equal(h.IpcMode, 'private'); assert.equal(h.CgroupnsMode, 'private');
  assert.equal(h.NetworkMode, binding.networkMode); assert.equal(h.AutoRemove, false);
  assert.deepEqual(h.CapDrop, ['ALL']); assert.ok(h.CapAdd === null || Array.isArray(h.CapAdd) && h.CapAdd.length === 0);
  assert.deepEqual(h.SecurityOpt, ['no-new-privileges']); assert.equal(h.RestartPolicy.Name, 'no');
  assert.equal(h.RestartPolicy.MaximumRetryCount, 0); assert.equal(c.RestartCount, 0);
  assert.ok(Array.isArray(c.Mounts) && c.Mounts.length === binding.mounts.length);
  const mounts = c.Mounts.map(mount => {
    assert.equal(mount.Type, 'bind'); assert.equal(mount.RW, false); assert.equal(mount.Propagation, 'rprivate');
    return { source: mount.Source, destination: mount.Destination };
  });
  const sorted = rows => [...rows].sort((a,b) => a.destination.localeCompare(b.destination));
  assert.deepEqual(sorted(mounts), sorted(binding.mounts));
  assert.match(c.Created, DATE); assert.match(s.StartedAt, DATE);
  assert.ok(Number.isFinite(Date.parse(c.Created)) && Date.parse(s.StartedAt) >= Date.parse(c.Created));
  for (const key of ['Running', 'Paused', 'Restarting', 'OOMKilled', 'Dead']) assert.equal(typeof s[key], 'boolean');
  assert.equal(s.Paused, false); assert.equal(s.Restarting, false); assert.equal(s.Dead, false); assert.equal(s.ErrorEmpty, true);
  integer(s.Pid, 0, 2 ** 31 - 1); integer(s.ExitCode, 0, 255);
  assert.ok(s.Status === 'running' && s.Running && s.Pid > 0 || s.Status === 'exited' && !s.Running && s.Pid === 0);
  if (s.Status === 'exited') {
    assert.match(s.FinishedAt, DATE); assert.ok(Date.parse(s.FinishedAt) >= Date.parse(s.StartedAt));
  }
  return { engineId: binding.engineId, containerId: c.Id, imageId: c.Image, ownerToken: binding.ownerToken,
    createdAt: c.Created, startedAt: s.StartedAt, finishedAt: s.Status === 'exited' ? s.FinishedAt : null,
    pid: s.Pid, status: s.Status, exitCode: s.ExitCode, oomKilled: s.OOMKilled,
    configurationDigest: digest({ user: c.Config.User, host: { privileged: h.Privileged, readOnly: h.ReadonlyRootfs,
      pid: h.PidMode, ipc: h.IpcMode, cgroup: h.CgroupnsMode, network: h.NetworkMode,
      caps: h.CapDrop, security: h.SecurityOpt, restart: h.RestartPolicy }, mounts }) };
}

/**
 * Evidence for one dedicated, fully contained process tree. Arm before inference;
 * stop the owned container separately before confirming cleanup. No Runtime endpoint,
 * semantic quality, filesystem-read or egress guarantee is inferred from this proof.
 */
export function createDockerExitObserver({ evidenceRoot, binding: rawBinding, dockerClient }) {
  const binding = validateBinding(rawBinding);
  assert.equal(typeof dockerClient.inspect, 'function');
  let admitted = false, ready = false, poisoned = false, active = false, sequence = 0, baseline, claim, directory;
  const inspect = async () => {
    const raw = await dockerClient.inspect(binding.containerId);
    try { return observedSnapshot(raw, binding); }
    catch { poisoned = true; throw new Error('Owned container identity or containment changed.'); }
  };
  async function record(name, value) {
    try { await writeNew(join(directory, name), value); }
    catch (error) { poisoned = true; throw error; }
  }
  function identity(row) { return [row.engineId, row.containerId, row.imageId, row.ownerToken, row.createdAt, row.startedAt, row.configurationDigest]; }
  async function inspectArmedIdentity() {
    const row = await inspect();
    if (canonical(identity(row)) !== canonical(identity(baseline)) || row.status === 'running' && row.pid !== baseline.pid) {
      poisoned = true; throw new Error('Owned container was restarted or replaced.');
    }
    return row;
  }
  return {
    async arm(raw) {
      fields(raw, ['resetId', 'stage', 'sessionId']); assert.match(raw.resetId, UUID);
      assert.ok(['author', 'catlas', 'reviewer'].includes(raw.stage)); safeText(raw.sessionId, 160);
      assert.equal(admitted, false, 'Container observer already consumed.'); admitted = true;
      claim = structuredClone(raw);
      directory = join(await physical(evidenceRoot), 'resets', claim.resetId, `container-${claim.stage}`);
      assert.equal(await physical(directory), directory, 'Observer journal escaped its owned root.');
      await mkdir(directory, { recursive: false, mode: 0o700 });
      const claimPath = join(await physical(evidenceRoot), 'container-claims', `${binding.containerId}.json`);
      assert.equal(await physical(claimPath), claimPath, 'Container claim escaped its owned root.');
      await writeNew(claimPath, { ...claim, ownerToken: binding.ownerToken, bindingDigest: digest(binding) });
      await record('intent.json', { ...claim, bindingDigest: digest(binding), containerId: binding.containerId });
      baseline = await inspect(); assert.equal(baseline.status, 'running');
      await record('armed.json', { ...claim, observation: baseline }); ready = true;
      return { scope: 'container-exit', status: 'armed', evidenceRefs: [`container:${digest(baseline)}`] };
    },
    async confirmExit(raw) {
      if (!ready || poisoned || active || sequence >= 32 || canonical(raw) !== canonical(claim)) return incomplete();
      active = true; const number = ++sequence;
      try {
        const first = await inspectArmedIdentity(), second = await inspectArmedIdentity();
        const complete = first.status === 'exited' && second.status === 'exited' && canonical(first) === canonical(second);
        const receipt = { ...claim, observation: second, previousDigest: digest(first), complete };
        await record(`observation-${String(number).padStart(4, '0')}.json`, receipt);
        return complete ? { scope: 'container-exit', status: 'complete', evidenceRefs: [`container:${digest(receipt)}`] } : incomplete();
      } catch {
        try { await record(`failure-${String(number).padStart(4, '0')}.json`, { ...claim, poisoned, status: 'incomplete' }); } catch { /* Never claim success without a receipt. */ }
        return incomplete();
      } finally { active = false; }
    },
  };
}
