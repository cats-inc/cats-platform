import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { readJson, writeNew } from '../tools/knowledge-practice/artifacts.mjs';
import { createDockerExitObserver, createDockerReadClient } from '../tools/knowledge-practice/dockerObserver.mjs';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'cats-container-observer-'));
  t.after(async () => { assert.ok(root.startsWith(join(tmpdir(), 'cats-container-observer-'))); await rm(root, { recursive:true, force:true }); });
  const claim = { resetId:randomUUID(), stage:'reviewer', sessionId:'public-review-session' };
  await mkdir(join(root,'resets',claim.resetId), { recursive:true });
  const binding = { engineId:randomUUID(), containerId:'a'.repeat(64), imageId:`sha256:${'b'.repeat(64)}`,
    ownerToken:randomUUID(), networkMode:'none', mounts:[{source:join(root,'readable'),destination:'/workspace'}] };
  const raw = { engineId:binding.engineId, container:{ Id:binding.containerId, Image:binding.imageId,
    Created:'2026-09-26T00:00:00.123456789Z', RestartCount:0,
    Config:{ User:'65534:65534', Labels:{ 'cats.knowledge.owner':binding.ownerToken }, Env:['PRIVATE=must-not-persist'] },
    HostConfig:{ Privileged:false, ReadonlyRootfs:true, PidMode:'', IpcMode:'private', CgroupnsMode:'private',
      NetworkMode:'none', AutoRemove:false, CapDrop:['ALL'], CapAdd:null, SecurityOpt:['no-new-privileges'],
      RestartPolicy:{Name:'no',MaximumRetryCount:0} },
    Mounts:[{Type:'bind',Source:binding.mounts[0].source,Destination:'/workspace',RW:false,Propagation:'rprivate'}],
    State:{Status:'running',Running:true,Paused:false,Restarting:false,OOMKilled:false,Dead:false,Pid:245,
      ExitCode:0,ErrorEmpty:true,StartedAt:'2026-09-26T00:00:01.123456789Z',FinishedAt:'0001-01-01T00:00:00Z',
      Health:{Log:[{Output:'must-not-persist'}]}} } };
  let read = async () => structuredClone(raw), calls = 0;
  const options = { evidenceRoot:root, binding, dockerClient:{inspect:async id => { assert.equal(id,binding.containerId); calls++; return read(); }} };
  const exit = () => Object.assign(raw.container.State,{Status:'exited',Running:false,Pid:0,FinishedAt:'2026-09-26T00:00:02.123456789Z'});
  return {root,claim,binding,raw,options,exit,create:()=>createDockerExitObserver(options),calls:()=>calls,setRead:fn=>{read=fn;},
    journal:join(root,'resets',claim.resetId,'container-reviewer')};
}

test('container exit needs prior running identity and two fresh stopped observations, and retains only projected evidence', async t => {
  const f=await setup(t), observer=f.create();
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(f.calls(),0);
  assert.equal((await observer.arm(f.claim)).status,'armed');
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
  f.exit();
  assert.deepEqual(Object.keys(await observer.confirmExit(f.claim)).sort(),['evidenceRefs','scope','status']);
  const receipt=await readJson(join(f.journal,'observation-0002.json'));
  assert.equal(receipt.complete,true); assert.equal(receipt.observation.pid,0); assert.equal(receipt.observation.status,'exited');
  assert.equal(JSON.stringify(receipt).includes('must-not-persist'),false);
  assert.equal(f.calls(),5);
  await assert.rejects(observer.arm(f.claim),/already consumed/u);
  assert.equal((await observer.confirmExit({...f.claim,sessionId:'foreign'})).status,'incomplete'); assert.equal(f.calls(),5);
});

test('a full container ID cannot be rebound under another reset after observer reconstruction', async t => {
  const f=await setup(t); await f.create().arm(f.claim);
  const next={...f.claim,resetId:randomUUID()}; await mkdir(join(f.root,'resets',next.resetId));
  await assert.rejects(f.create().arm(next),{code:'EEXIST'}); assert.equal(f.calls(),1);
});

test('an already exited container cannot be armed as pre-dispatch evidence', async t => {
  const f=await setup(t); f.exit(); const observer=f.create();
  await assert.rejects(observer.arm(f.claim)); assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
  assert.equal(f.calls(),1);
});

test('a different running PID with unchanged start time invalidates the captured process identity', async t => {
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim); f.raw.container.State.Pid=999;
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); f.exit();
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
});

for (const change of ['start-time','running-pid']) test(`first-read ${change} drift cannot be erased by a later transport failure`, async t => {
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim);
  const drift=structuredClone(f.raw);
  if(change==='start-time')drift.container.State.StartedAt='2026-09-26T00:00:01.987654321Z';
  else drift.container.State.Pid=999;
  let read=0;
  f.setRead(async()=>{if(++read===1)return drift;throw new Error('Later transport failure');});
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
  f.exit(); f.setRead(async()=>structuredClone(f.raw));
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
  assert.equal(f.calls(),2); assert.equal(read,1);
  assert.equal((await readJson(join(f.journal,'failure-0001.json'))).poisoned,true);
});

const changed = {
  daemon:f=>{f.raw.engineId=randomUUID();}, container:f=>{f.raw.container.Id='c'.repeat(64);},
  image:f=>{f.raw.container.Image=`sha256:${'c'.repeat(64)}`;},
  owner:f=>{f.raw.container.Config.Labels['cats.knowledge.owner']=randomUUID();},
  created:f=>{f.raw.container.Created='2026-09-26T00:00:00.987654321Z';},
  restarted:f=>{f.raw.container.RestartCount=1;},
  'same-count-new-start':f=>{f.raw.container.State.StartedAt='2026-09-26T00:00:01.987654321Z';},
  privileged:f=>{f.raw.container.HostConfig.Privileged=true;},
  'host-pid':f=>{f.raw.container.HostConfig.PidMode='host';},
  network:f=>{f.raw.container.HostConfig.NetworkMode='host';},
  autoremove:f=>{f.raw.container.HostConfig.AutoRemove=true;},
  'automatic-restart':f=>{f.raw.container.HostConfig.RestartPolicy.Name='always';},
  'added-capability':f=>{f.raw.container.HostConfig.CapAdd=['SYS_ADMIN'];},
  'writable-bind':f=>{f.raw.container.Mounts[0].RW=true;},
  'extra-bind':f=>{f.raw.container.Mounts.push({...f.raw.container.Mounts[0],Destination:'/outside'});},
  'invalid-finish':f=>{f.raw.container.State.FinishedAt='2026-09-25T00:00:00Z';},
  'dead-state':f=>{f.raw.container.State.Dead=true;},
};
for(const [kind,change] of Object.entries(changed)) test(`observed ${kind} drift permanently invalidates the armed container`,async t=>{
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim); f.exit();
  const original=structuredClone(f.raw); change(f);
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
  f.setRead(async()=>structuredClone(original)); const calls=f.calls();
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(f.calls(),calls);
});

test('nonzero exit and OOM are retained independently of confirmed process disappearance',async t=>{
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim); f.exit();
  f.raw.container.State.ExitCode=137; f.raw.container.State.OOMKilled=true;
  const result=await observer.confirmExit(f.claim); assert.equal(result.status,'complete'); assert.equal(result.scope,'container-exit');
  const {observation}=await readJson(join(f.journal,'observation-0001.json'));
  assert.equal(observation.exitCode,137); assert.equal(observation.oomKilled,true);
});

test('running-to-exited between the two reads needs a later stable observation',async t=>{
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim);
  let read=0; f.setRead(async()=>{ if(++read===2)f.exit(); return structuredClone(f.raw); });
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
  assert.equal((await observer.confirmExit(f.claim)).status,'complete');
});

test('missing containers and transport failures never become exit proof or expose raw errors',async t=>{
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim);
  f.setRead(async()=>{throw new Error('secret transport diagnostic');});
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
  assert.equal(JSON.stringify(await readJson(join(f.journal,'failure-0001.json'))).includes('secret'),false);
  f.exit(); f.setRead(async()=>structuredClone(f.raw)); assert.equal((await observer.confirmExit(f.claim)).status,'complete');
  f.setRead(async()=>{throw new Error('No such object');});
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete');
});

test('concurrent confirmation cannot share a pending observation or double-spend its journal sequence',async t=>{
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim); f.exit();
  let release,started; const seen=new Promise(done=>{started=done;});
  f.setRead(async()=>{started(); await new Promise(done=>{release=done;}); return structuredClone(f.raw);});
  const pending=observer.confirmExit(f.claim); await seen;
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(f.calls(),2);
  f.setRead(async()=>structuredClone(f.raw)); release();
  assert.equal((await pending).status,'complete'); assert.equal(f.calls(),3);
});

test('failed durable receipt cannot certify exit even after the blocking file is removed',async t=>{
  const f=await setup(t), observer=f.create(); await observer.arm(f.claim); f.exit();
  const file=join(f.journal,'observation-0001.json'); await writeNew(file,{occupied:true});
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); await rm(file);
  const calls=f.calls(); assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(f.calls(),calls);
});

test('read transport fixes the local daemon, projects permitted fields and strips inherited Docker overrides',async t=>{
  const f=await setup(t), calls=[];
  t.mock.method(childProcess,'spawn',(executable,args,options)=>{
    calls.push({executable,args,options});
    const child=new EventEmitter(); child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.kill=()=>{};
    queueMicrotask(()=>{child.stdout.write(args.includes('info')?f.binding.engineId:JSON.stringify(f.raw.container)); child.emit('close',0);});
    return child;
  });
  syncBuiltinESMExports(); t.after(()=>{t.mock.restoreAll(); syncBuiltinESMExports();});
  const config={executable:process.execPath,configRoot:f.root,cwd:f.root,host:'npipe:////./pipe/docker-test'};
  const result=await createDockerReadClient(config).inspect(f.binding.containerId);
  assert.equal(result.engineId,f.binding.engineId); assert.equal(calls.length,3);
  for(const call of calls){
    assert.deepEqual(call.args.slice(0,4),['--config',f.root,'--host',config.host]);
    assert.equal(call.options.windowsHide,true); assert.equal(call.options.shell,undefined);
    assert.ok(Object.keys(call.options.env).every(key=>/^(path|pathext|systemroot|windir|systemdrive|comspec|temp|tmp)$/iu.test(key)));
  }
  const projected=calls[1].args[7];
  assert.ok(projected.includes('ErrorEmpty')); assert.ok(!projected.includes('json .Config}'));
  assert.ok(!projected.includes('Health')); assert.ok(!projected.includes('.Env')); assert.ok(!projected.includes('.Cmd'));
  assert.throws(()=>createDockerReadClient({...config,host:'tcp://127.0.0.1:2375'}),/local daemon/u);
});

for (const failure of ['timeout','output-limit']) test(`read transport ${failure} kills and waits for only its own CLI`,async t=>{
  const f=await setup(t); let killed=0, calls=0;
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(childProcess,'spawn',()=>{
    calls++; const child=new EventEmitter(); child.pid=12345; child.stdout=new PassThrough(); child.stderr=new PassThrough();
    child.kill=()=>{killed++; queueMicrotask(()=>child.emit('close',null)); return true;};
    if(failure==='output-limit')queueMicrotask(()=>child.stderr.write('x'.repeat(128*1024+1)));
    return child;
  });
  syncBuiltinESMExports(); t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  const pending=createDockerReadClient({executable:process.execPath,configRoot:f.root,cwd:f.root,host:'unix:///tmp/docker-fixture.sock'})
    .inspect(f.binding.containerId);
  const rejected=assert.rejects(pending,/observation unavailable/u);
  if(failure==='timeout')t.mock.timers.tick(5000);
  await rejected; assert.equal(killed,1); assert.equal(calls,1);
});

for(const outcome of ['second-kill-exit','unresolved','live-error','spawn-error'])
test(`read transport ${outcome} bounds termination and reports unresolved CLI ownership`,async t=>{
  const f=await setup(t), kills=[]; let child, calls=0, unrefs=0;
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(childProcess,'spawn',()=>{
    calls++; child=new EventEmitter(); child.pid=outcome==='spawn-error'?undefined:12345;
    child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.unref=()=>{unrefs++;};
    child.kill=signal=>{kills.push(signal??'SIGTERM'); if(outcome==='second-kill-exit'&&signal==='SIGKILL')queueMicrotask(()=>child.emit('exit',null)); return true;};
    if(outcome.endsWith('error'))queueMicrotask(()=>child.emit('error',new Error('must not expose raw error')));
    return child;
  });
  syncBuiltinESMExports(); t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  const client=createDockerReadClient({executable:process.execPath,configRoot:f.root,cwd:f.root,host:'unix:///tmp/docker-fixture.sock'});
  const rejected=assert.rejects(client.inspect(f.binding.containerId),/observation unavailable/u);
  await Promise.resolve();
  if(!outcome.endsWith('error'))t.mock.timers.tick(5000);
  t.mock.timers.tick(250); await Promise.resolve();
  t.mock.timers.tick(750); await rejected;
  if(outcome==='spawn-error'){assert.deepEqual(kills,[]); assert.equal(unrefs,0);}
  else assert.deepEqual(kills,['SIGTERM','SIGKILL']);
  if(outcome==='unresolved'||outcome==='live-error'){
    assert.deepEqual(client.inspectTransport(),{unavailable:true,pendingCliPids:[12345]}); assert.equal(unrefs,1);
    await assert.rejects(client.inspect(f.binding.containerId),/observation unavailable/u); assert.equal(calls,1);
    child.emit('exit',null); assert.deepEqual(client.inspectTransport(),{unavailable:true,pendingCliPids:[]});
  }else assert.deepEqual(client.inspectTransport(),{unavailable:false,pendingCliPids:[]});
});
