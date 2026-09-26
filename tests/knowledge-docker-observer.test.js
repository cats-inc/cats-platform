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
import { digest, readJson, writeNew } from '../tools/knowledge-practice/artifacts.mjs';
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
  assert.equal(Object.hasOwn(receipt.observation,'seccompProfileSha256'),false);
  assert.equal(JSON.stringify(receipt).includes('must-not-persist'),false);
  assert.equal(f.calls(),5);
  await assert.rejects(observer.arm(f.claim),/already consumed/u);
  assert.equal((await observer.confirmExit({...f.claim,sessionId:'foreign'})).status,'incomplete'); assert.equal(f.calls(),5);
});

const policyText = '{ "defaultAction": "SCMP_ACT_ERRNO", "syscalls": [], "comment": "private-policy-marker" }\n';
function bindPolicy(f, text = policyText) {
  f.binding.seccompProfileSha256 = digest(text);
  f.raw.container.HostConfig.SecurityOpt = ['no-new-privileges', `seccomp=${text}`];
}

test('an explicitly bound seccomp policy retains only its exact byte digest and confirms a fresh exit', async t => {
  const f=await setup(t); bindPolicy(f); const bindingDigest=digest(f.binding), observer=f.create();
  // Caller mutation after admission cannot change the observer's identity.
  f.binding.seccompProfileSha256='c'.repeat(64);
  assert.equal((await observer.arm(f.claim)).status,'armed');
  f.exit(); const result=await observer.confirmExit(f.claim);
  assert.equal(result.status,'complete'); assert.equal(result.scope,'container-exit'); assert.equal(f.calls(),3);
  for(const file of ['armed.json','observation-0001.json']) {
    const receipt=await readJson(join(f.journal,file));
    assert.equal(receipt.observation.seccompProfileSha256,digest(policyText));
    assert.equal(JSON.stringify(receipt).includes('private-policy-marker'),false);
    assert.equal(JSON.stringify(receipt).includes('SCMP_ACT_ERRNO'),false);
  }
  for(const file of [join(f.journal,'intent.json'),join(f.root,'container-claims',`${f.binding.containerId}.json`)]) {
    const receipt=await readJson(file); assert.equal(receipt.bindingDigest,bindingDigest);
    assert.equal(JSON.stringify(receipt).includes('private-policy-marker'),false);
  }
  const next={...f.claim,resetId:randomUUID()}; await mkdir(join(f.root,'resets',next.resetId));
  await assert.rejects(f.create().arm(next),{code:'EEXIST'}); assert.equal(f.calls(),3);
});

for(const [name,value] of Object.entries({null:null,undefined:undefined,empty:'',short:'a'.repeat(63),
  uppercase:'A'.repeat(64),whitespace:'a'.repeat(64)+' ',number:123,array:['a'.repeat(64)]}))
test(`explicit ${name} seccomp digest is rejected before any observation`,async t=>{
  const f=await setup(t); f.binding.seccompProfileSha256=value;
  assert.throws(()=>f.create()); assert.equal(f.calls(),0);
});

test('an omitted seccomp binding keeps rejecting custom profiles',async t=>{
  const f=await setup(t); f.raw.container.HostConfig.SecurityOpt.push(`seccomp=${policyText}`);
  const observer=f.create(); await assert.rejects(observer.arm(f.claim),/identity or containment changed/u);
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(f.calls(),1);
});

test('explicit policy binding cannot reclaim a container rejected by the default observer',async t=>{
  const f=await setup(t); f.raw.container.HostConfig.SecurityOpt.push(`seccomp=${policyText}`);
  await assert.rejects(f.create().arm(f.claim),/identity or containment changed/u);
  bindPolicy(f);
  const next={...f.claim,resetId:randomUUID()}; await mkdir(join(f.root,'resets',next.resetId));
  await assert.rejects(f.create().arm(next),{code:'EEXIST'}); assert.equal(f.calls(),1);
});

for(const [name,text] of Object.entries({malformed:'{"defaultAction":',unconfined:'unconfined',array:'[]',
  null:'null',string:'"SCMP_ACT_ERRNO"',missing:'{}',allow:'{"defaultAction":"SCMP_ACT_ALLOW"}'}))
test(`a matching hash cannot admit a ${name} seccomp profile`,async t=>{
  const f=await setup(t); bindPolicy(f,text); const observer=f.create();
  await assert.rejects(observer.arm(f.claim),/identity or containment changed/u);
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(f.calls(),1);
});

for(const [name,options] of Object.entries({missing:['no-new-privileges'],
  reordered:[`seccomp=${policyText}`,'no-new-privileges'],
  extra:['no-new-privileges',`seccomp=${policyText}`,'apparmor=unconfined'],
  duplicate:['no-new-privileges',`seccomp=${policyText}`,`seccomp=${policyText}`],
  wrongPrefix:['no-new-privileges',`seccomp:${policyText}`],
  missingNnp:[`seccomp=${policyText}`],notArray:{0:'no-new-privileges',1:`seccomp=${policyText}`,length:2}}))
test(`bound policy rejects ${name} security options`,async t=>{
  const f=await setup(t); bindPolicy(f); f.raw.container.HostConfig.SecurityOpt=options;
  await assert.rejects(f.create().arm(f.claim),/identity or containment changed/u);
});

for(const [name,expected] of Object.entries({wrong:'0'.repeat(64),trimmed:digest(policyText.trim()),
  canonical:digest(JSON.stringify(JSON.parse(policyText)))}))
test(`a ${name} policy digest cannot substitute for exact raw bytes`,async t=>{
  const f=await setup(t); bindPolicy(f); f.binding.seccompProfileSha256=expected;
  await assert.rejects(f.create().arm(f.claim),/identity or containment changed/u);
});

test('the policy size budget counts UTF-8 bytes and is enforced before JSON parsing',async t=>{
  const f=await setup(t);
  const prefix='{"defaultAction":"SCMP_ACT_ERRNO","comment":"', suffix='"}';
  const text=prefix+'界'.repeat(22000)+suffix;
  assert.ok(text.length<64*1024); assert.ok(Buffer.byteLength(text)>64*1024); bindPolicy(f,text);
  let parses=0; const parse=JSON.parse;
  t.mock.method(JSON,'parse',(...args)=>{if(args[0]===text)parses++;return parse(...args);});
  await assert.rejects(f.create().arm(f.claim),/identity or containment changed/u); assert.equal(parses,0);
});

test('an exact 64 KiB UTF-8 policy can be bound without persisting its body',async t=>{
  const f=await setup(t), prefix='{"defaultAction":"SCMP_ACT_ERRNO","comment":"界', suffix='"}';
  const text=prefix+'a'.repeat(64*1024-Buffer.byteLength(prefix+suffix))+suffix;
  assert.equal(Buffer.byteLength(text),64*1024); bindPolicy(f,text);
  const observer=f.create(); assert.equal((await observer.arm(f.claim)).status,'armed'); f.exit();
  assert.equal((await observer.confirmExit(f.claim)).status,'complete');
  const receipt=await readJson(join(f.journal,'observation-0001.json'));
  assert.equal(receipt.observation.seccompProfileSha256,digest(text)); assert.ok(JSON.stringify(receipt).length<4096);
});

for(const position of [1,2]) test(`policy drift on read ${position} poisons immediately despite later transport failure or restoration`,async t=>{
  const f=await setup(t); bindPolicy(f); const observer=f.create(); await observer.arm(f.claim); f.exit();
  const drift=structuredClone(f.raw); drift.container.HostConfig.SecurityOpt[1]+=' ';
  let reads=0;
  f.setRead(async()=>{reads++;if(reads<position)return structuredClone(f.raw);if(reads===position)return drift;throw new Error('Later transport failure');});
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(reads,position);
  assert.equal((await readJson(join(f.journal,'failure-0001.json'))).poisoned,true);
  f.setRead(async()=>structuredClone(f.raw));
  assert.equal((await observer.confirmExit(f.claim)).status,'incomplete'); assert.equal(f.calls(),position+1);
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

for(const kind of ['added-capability','writable-bind','network'])
test(`explicit policy binding still rejects ${kind} containment drift`,async t=>{
  const f=await setup(t); bindPolicy(f); const observer=f.create(); await observer.arm(f.claim); f.exit();
  const original=structuredClone(f.raw); changed[kind](f);
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
