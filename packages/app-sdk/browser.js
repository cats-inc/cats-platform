// Injected by the host before the app. No credentials or general HTTP proxy.
(() => {
  'use strict';
  const boot = globalThis.__CATS_APP_BOOT__;
  delete globalThis.__CATS_APP_BOOT__;
  const pending = new Map();
  let nextId = 0;
  let port;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const connect = (event) => {
    if (event.source !== parent || event.data?.type !== 'cats.app.connect'
      || event.data?.nonce !== boot.nonce || !event.ports[0] || port) return;
    port = event.ports[0];
    window.removeEventListener('message', connect);
    port.onmessage = ({ data }) => {
      const request = pending.get(data?.id);
      if (!request) return;
      pending.delete(data.id);
      clearTimeout(request.timer);
      if (data.ok) request.resolve(data.value);
      else request.reject(new Error(data.error || 'App bridge request failed.'));
    };
    port.start();
    resolveReady();
  };
  window.addEventListener('message', connect);
  parent.postMessage({ type: 'cats.app.ready', nonce: boot.nonce }, '*');
  const request = async (method) => {
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('App host is unavailable.')), 5000))]);
    if (pending.size >= 4) throw new Error('Too many pending app requests.');
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('App bridge timed out.')); }, 12000);
      pending.set(id, { resolve, reject, timer });
      port.postMessage({ id, method });
    });
  };
  Object.defineProperty(globalThis, 'catsApp', { value: Object.freeze({
    sdkVersion: '1.0.0', appId: boot.appId, version: boot.version,
    locale: boot.locale, theme: boot.theme,
    usage: Object.freeze({ getSnapshot: () => request('usage.snapshot') }),
    openLobby: () => request('navigation.lobby'),
  }), writable: false, configurable: false });
})();
