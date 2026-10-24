#!/usr/bin/env node
/** One-time ngrok forwarding to the installed Desktop's shared ingress.
 * Usage: node scripts/testing/ask-ngrok-session.mjs [--cdp-port 9222]
 * Enter the authtoken only in the printed loopback form. No token is saved.
 * Requires an unconfigured/disconnected ingress. Does not install Apps or create questions.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { listTargets, selectPageTarget, openCdpSession } from './desktop-renderer-cdp.mjs';

async function desktopRequest(port, method, body) {
  const target = selectPageTarget(await listTargets({ port }));
  const session = await openCdpSession(target.webSocketDebuggerUrl);
  try {
    return await session.evaluate(`window.catsDesktopHost.requestApp(${JSON.stringify({
      path: '/api/platform/ingress', method, ...(body ? { body } : {}),
    })})`);
  } finally { session.close(); }
}

const remote = result => {
  if (result?.status !== 200 || !result.body?.remoteAccess) throw new Error('desktop_unavailable');
  return result.body.remoteAccess;
};
const unused = status => !status.enabled && !status.configured && !status.legacySources?.length;
const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
};

export async function startSession({
  request = (method, body) => desktopRequest(9222, method, body),
  forward = async options => (await import('@ngrok/ngrok')).forward(options),
  lifetimeMs = 2 * 60 * 60_000,
  monitorMs = 15_000,
  connectionTimeoutMs = 30_000,
  cleanupTimeoutMs = 5_000,
} = {}) {
  const previous = remote(await request('GET'));
  if (!unused(previous)) throw new Error('Existing remote settings must be preserved. Disconnect/configure manually first.');
  let state = 'awaiting_token';
  let publicOrigin = null;
  let target = null;
  let listener;
  let openingPending = false;
  let retainedReservation;
  let closed = false;
  let connecting;
  let cleanupPending = false;
  const prefix = `/${randomBytes(24).toString('hex')}`;
  const nonce = randomBytes(24).toString('hex');
  const ownsSettings = status => status.enabled && status.provider === 'external'
    && status.configuredOrigin === publicOrigin && status.listenPort === Number(new URL(target).port);
  const owns = status => ownsSettings(status) && status.target === target;
  const restore = async () => {
    if (!publicOrigin || !target) return;
    try {
      if (ownsSettings(remote(await request('GET')))) {
        remote(await request('POST', { enabled: false, provider: previous.provider,
          listenPort: previous.listenPort, publicOrigin: previous.configuredOrigin }));
      }
    } catch { cleanupPending = true; }
  };
  const stopForwarding = async () => {
    // Revoke Cats admission before a potentially failing/hung native RPC.
    cleanupPending = openingPending;
    await restore();
    const active = listener;
    if (!active) return;
    let timer;
    try {
      await Promise.race([Promise.resolve().then(() => active.close()), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('cleanup_timeout')), cleanupTimeoutMs);
      })]);
      if (listener === active) listener = undefined;
      if (retainedReservation) {
        retainedReservation.closeAllConnections();
        await new Promise(resolve => retainedReservation.close(resolve));
        retainedReservation = undefined;
      }
    } catch { cleanupPending = true; }
    finally { clearTimeout(timer); }
  };
  async function connect(authtoken) {
    if (closed || connecting || listener || openingPending) throw new Error('session_busy');
    if (typeof authtoken !== 'string' || !/^[A-Za-z0-9_-]{20,512}$/.test(authtoken)) throw new Error('invalid_token');
    state = 'connecting';
    connecting = (async () => {
      // Keep the port reserved while obtaining the public name. Never target 8181/3110.
      const reservation = createServer((_, response) => response.writeHead(503).end());
      try {
        if (!unused(remote(await request('GET')))) throw new Error('settings_changed');
        await new Promise((resolve, reject) => {
          reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve);
        });
        target = `http://127.0.0.1:${reservation.address().port}`;
        let expired = false;
        let timeout;
        openingPending = true;
        const opening = Promise.resolve().then(() => forward({ addr: target, authtoken,
          authtoken_from_env: false, force_new_session: true })).then(async candidate => {
          openingPending = false;
          if (expired) {
            listener = candidate;
            await stopForwarding();
            if (cleanupPending) state = 'cleanup_pending';
            throw new Error('connection_timeout');
          }
          return candidate;
        }, async () => {
          openingPending = false;
          if (retainedReservation === reservation) {
            await new Promise(resolve => reservation.close(resolve)); retainedReservation = undefined;
          }
          cleanupPending = false;
          throw new Error('connection_failed');
        });
        try {
          listener = await Promise.race([opening, new Promise((_, reject) => {
            timeout = setTimeout(() => {
              expired = true; retainedReservation = reservation; reject(new Error('connection_timeout'));
            }, connectionTimeoutMs);
          })]);
        } finally { clearTimeout(timeout); }
        authtoken = '';
        const url = new URL(listener.url());
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
          throw new Error('invalid_origin');
        }
        publicOrigin = url.origin;
        await new Promise(resolve => reservation.close(resolve));
        if (closed || !unused(remote(await request('GET')))) throw new Error('settings_changed');
        const status = remote(await request('POST', { enabled: true, provider: 'external',
          publicOrigin, listenPort: Number(new URL(target).port) }));
        if (!owns(status) || !status.enabled) throw new Error('ingress_not_ready');
        if (closed) throw new Error('session_closed');
        state = 'provider_connected'; // Grok Bot must still establish independent public acceptance.
      } catch {
        state = closed ? 'stopped' : 'connection_failed';
        await stopForwarding();
      } finally {
        authtoken = '';
        reservation.closeAllConnections();
        if (reservation.listening && retainedReservation !== reservation) await new Promise(resolve => reservation.close(resolve));
      }
    })();
    try { await connecting; } finally { connecting = undefined; }
  }
  const snapshot = () => ({ state, publicOrigin, mcpUrl: publicOrigin ? `${publicOrigin}/apps/cats.ask/mcp` : null,
    cleanupPending, expiresAt });
  let stopping;
  const close = () => {
    if (stopping) return stopping;
    closed = true;
    clearInterval(monitor); clearTimeout(expiry);
    stopping = (async () => {
      await connecting;
      await stopForwarding();
      state = cleanupPending ? 'cleanup_pending' : 'stopped';
    })().finally(() => { stopping = undefined; });
    return stopping;
  };
  let checking = false;
  const monitor = setInterval(async () => {
    if (checking || state !== 'provider_connected') return;
    checking = true;
    try { if (!owns(remote(await request('GET')))) await close(); }
    catch { await close(); }
    finally { checking = false; }
  }, monitorMs);
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
  const expiry = setTimeout(() => { void close(); }, lifetimeMs);
  const server = createServer((req, res) => {
    void (async () => {
      if (req.headers.host !== new URL(controlUrl).host) { json(res, 403, { error: 'host_denied' }); return; }
      if (req.method === 'GET' && req.url === `${prefix}/status`) { json(res, 200, snapshot()); return; }
      if (req.method === 'GET' && req.url === prefix) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
          'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'` });
        res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>Cats Ask · ngrok 一次性連線</title>
<style>body{font:17px system-ui;max-width:650px;margin:60px auto;padding:24px;line-height:1.7}input{font:inherit;width:90%;padding:10px}button{font:inherit;padding:8px 16px;margin:16px 8px 0 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<h1>Cats Ask · 一次性連線</h1><p>輸入你自己的 ngrok authtoken。只供這次連線使用，不儲存在 Cats 設定或檔案中。</p>
<p>連線後，回到 Cats 的 Ask → 首次設定，複製 Bot 連線指令到自己的 Grok Bot。</p>
<form id="form"><input id="token" type="password" autocomplete="off" aria-label="ngrok authtoken" required><br><button id="connect">開始連線</button></form>
<button id="stop" type="button">停止這次連線</button><p id="status" role="status"></p><pre id="url"></pre>
<p>請保持 Cats 與這個本機工具運作。最長兩小時，結束後請按停止。</p>
<script nonce="${nonce}">
const status=document.querySelector('#status'),url=document.querySelector('#url'),input=document.querySelector('#token'),button=document.querySelector('#connect');
const labels={awaiting_token:'等待輸入 token',connecting:'正在連線…',provider_connected:'ngrok 已連線；等待實際 Grok Bot 往返驗證',connection_failed:'連線未完成。請確認 token、ngrok 帳號與網路後重試。',stopped:'已停止',cleanup_pending:'清理尚未確認，請重試停止並檢查 Cats 遠端連線設定。'};
async function update(){const s=await(await fetch(location.pathname+'/status',{cache:'no-store'})).json();status.textContent=labels[s.state];url.textContent=s.state==='provider_connected'?s.mcpUrl:'';button.disabled=s.cleanupPending||['connecting','provider_connected','stopped','cleanup_pending'].includes(s.state);if(s.cleanupPending&&s.state!=='cleanup_pending')status.textContent+='；請重試停止並確認 Cats 遠端連線設定。';}
document.querySelector('#form').onsubmit=async e=>{e.preventDefault();button.disabled=true;let body=JSON.stringify({authtoken:input.value.trim()});input.value='';try{const pending=fetch(location.pathname+'/connect',{method:'POST',headers:{'content-type':'application/json'},body});body='';await pending;}finally{body='';await update();}};
document.querySelector('#stop').onclick=async()=>{await fetch(location.pathname+'/stop',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await update();};setInterval(()=>update().catch(()=>{status.textContent='本機工具已結束';button.disabled=true;}),1500);update();
</script></html>`); return;
      }
      if (req.method !== 'POST' || req.headers.origin !== new URL(controlUrl).origin
        || req.headers['content-type'] !== 'application/json'
        || ![`${prefix}/connect`, `${prefix}/stop`].includes(req.url)) {
        json(res, 403, { error: 'request_denied' }); return;
      }
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 1024) { json(res, 413, { error: 'too_large' }); return; } }
      if (req.url.endsWith('/stop')) await close();
      else { let input = JSON.parse(body); body = ''; const pending = connect(input.authtoken); input = null; await pending; }
      json(res, 200, snapshot());
    })().catch(() => json(res, 400, { error: 'request_failed' })); // Never echo native SDK errors or submitted data.
  });
  server.requestTimeout = 45_000; server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const controlUrl = `http://127.0.0.1:${server.address().port}${prefix}`;
  return { controlUrl, snapshot, close, async dispose() {
    await close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log('Usage: node scripts/testing/ask-ngrok-session.mjs [--cdp-port 9222]\nEnter token only in the local form. Stop after testing; no auto-start.');
  else {
    if (args.length && (args.length !== 2 || args[0] !== '--cdp-port' || !/^\d+$/.test(args[1]))) throw new Error('Invalid arguments.');
    const cdpPort = Number(args[1] ?? 9222);
    const session = await startSession({ request: (method, body) => desktopRequest(cdpPort, method, body) });
    console.log(JSON.stringify({ controlUrl: session.controlUrl, pid: process.pid, expiresAt: session.snapshot().expiresAt }));
    const exit = async () => { await session.dispose(); process.exit(); };
    process.once('SIGINT', exit); process.once('SIGTERM', exit);
  }
}
