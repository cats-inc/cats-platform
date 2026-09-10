import { useEffect, useMemo, useRef, useState } from 'react';
import { createTranslator, parseMessageLocale, type MessageKey } from '../../shared/i18n/index.js';

export const APP_RENDERER_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const APP_RENDERER_STARTUP_TIMEOUT_MS = 15_000;

export function createAppBridgeNonce(cryptoSource: Pick<Crypto, 'getRandomValues'> = crypto): string {
  // getRandomValues is also available on HTTP hosts; randomUUID is secure-context-only.
  return Array.from(cryptoSource.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createAppDocument(html: string, sdk: string, boot: Record<string, string>): string {
  if (!/<head\s*>/i.test(html)) throw new Error('The app renderer has no head element.');
  const safeBoot = JSON.stringify(boot).replace(/</g, '\\u003c');
  // The first policy is enforced in addition to any app-authored CSP.
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${APP_RENDERER_CSP}"><script>globalThis.__CATS_APP_BOOT__=${safeBoot};\n${sdk}\n</script></head><body>${html}</body></html>`;
}

export function AppRendererSurface({ appId, version, title, locale, onLobby }: {
  appId: string; version: string; title: string; locale: string; onLobby: () => void;
}) {
  const t = useMemo(() => createTranslator(parseMessageLocale(locale) ?? 'en'), [locale]);
  const frame = useRef<HTMLIFrameElement>(null);
  const onLobbyRef = useRef(onLobby);
  onLobbyRef.current = onLobby;
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loads = useRef(0);
  const revoke = useRef<() => void>(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let nonce: string;
    let port: MessagePort | null = null;
    let disposed = false;
    let busy = false;
    const lastRequestAt = new Map<string, number>();
    loads.current = 0;
    setHtml(null); setError(null);
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    const close = () => { disposed = true; clearTimeout(startupTimer); controller.abort(); port?.close(); };
    const fail = (key: MessageKey) => { if (!disposed) { setError(key); close(); } };
    revoke.current = close;
    const bridge = (event: MessageEvent) => {
      if (disposed || port || event.source !== frame.current?.contentWindow || event.origin !== 'null'
        || event.data?.type !== 'cats.app.ready' || event.data.nonce !== nonce) return;
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = async ({ data }) => {
        if (disposed || !Number.isSafeInteger(data?.id) || data.id < 1) return;
        const reply = (ok: boolean, value?: unknown, message?: string) => {
          if (!disposed) port?.postMessage({ id: data.id, ok, value, error: message });
        };
        if (data.method === 'navigation.lobby') { reply(true); onLobbyRef.current(); return; }
        const refreshQuota = data.method === 'usage.refreshQuota';
        if (data.method !== 'usage.snapshot' && !refreshQuota) { reply(false, undefined, 'Unsupported app capability.'); return; }
        if (refreshQuota && (!['codex', 'copilot', 'claude', 'antigravity'].includes(data.params?.provider) || typeof data.params?.instance !== 'string'
          || !data.params.instance || data.params.instance.length > 100)) { reply(false, undefined, 'Invalid quota target.'); return; }
        if (busy || Date.now() - (lastRequestAt.get(data.method) ?? 0) < 1000) { reply(false, undefined, 'Usage refresh is rate limited.'); return; }
        busy = true; lastRequestAt.set(data.method, Date.now());
        try {
          const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/usage${refreshQuota ? '/refresh' : ''}?version=${encodeURIComponent(version)}`, {
            signal: controller.signal, cache: 'no-store',
            ...(refreshQuota ? { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: data.params.provider, instance: data.params.instance }) } : {}),
          });
          if (!response.ok) {
            if ([401, 403, 409].includes(response.status)) {
              reply(false, undefined, 'App access was revoked.');
              setError('appHostRendererAccessChanged'); close(); return;
            }
            throw new Error('Runtime usage is unavailable.');
          }
          reply(true, await response.json());
        } catch { reply(false, undefined, 'Runtime usage is unavailable.'); }
        finally { busy = false; }
      };
      port.start();
      frame.current?.contentWindow?.postMessage({ type: 'cats.app.connect', nonce }, '*', [channel.port2]);
      clearTimeout(startupTimer);
    };
    window.addEventListener('message', bridge);
    startupTimer = setTimeout(() => fail('appHostRendererTimedOut'), APP_RENDERER_STARTUP_TIMEOUT_MS);
    void (async () => {
      try {
        nonce = createAppBridgeNonce();
        const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/renderer?version=${encodeURIComponent(version)}`, { signal: controller.signal, cache: 'no-store' });
        if ([401, 403, 409].includes(response.status)) { fail('appHostRendererAccessChanged'); return; }
        if (!response.ok) throw new Error('This app has no available, verified renderer.');
        const payload = await response.json() as { html: string; sdk: string; version: string };
        if (disposed) return;
        if (payload.version !== version) { fail('appHostRendererAccessChanged'); return; }
        if (!disposed) setHtml(createAppDocument(payload.html, payload.sdk, {
          nonce, appId, version, locale,
          theme: document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
        }));
      } catch {
        fail('appHostRendererUnavailable');
      }
    })();
    return () => { close(); window.removeEventListener('message', bridge); };
  }, [appId, version, locale, attempt]);
  if (error) return <div>
    <p role="alert">{t(error)}</p>
    <button type="button" className="secondaryButton" onClick={() => setAttempt((current) => current + 1)}>
      {t('appHostRendererRetry')}
    </button>
  </div>;
  if (!html) return <p role="status">{t('appLoadingWithSurface', { surface: title })}</p>;
  return <iframe key={`${appId}:${version}:${locale}:${attempt}`} ref={frame} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer"
    srcDoc={html} style={{ width: '100%', height: 'calc(100dvh - 160px)', minHeight: 520, border: 0, borderRadius: 16 }}
    onLoad={() => { if (++loads.current > 1) { revoke.current(); setError('appHostRendererNavigatedAway'); } }} />;
}
