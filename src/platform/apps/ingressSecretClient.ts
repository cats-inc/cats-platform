import { randomUUID } from 'node:crypto';
import { INGRESS_SECRET_REQUEST, INGRESS_SECRET_RESPONSE, MAX_INGRESS_SECRET_BYTES,
  type IngressSecretProtector } from '#cats-ingress-secrets';

/** The private IPC channel is supplied only by the native Desktop supervisor. */
export function createIngressSecretClient(channel: NodeJS.Process = process): IngressSecretProtector {
  const pending = new Map<string, { resolve(value: string): void; reject(error: Error): void;
    timer: ReturnType<typeof setTimeout> }>();
  channel.on('message', (message: unknown) => {
    const input = message as { type?: string; id?: string; value?: unknown; error?: unknown } | null;
    if (input?.type !== INGRESS_SECRET_RESPONSE || !input.id) return;
    const entry = pending.get(input.id);
    if (!entry) return;
    pending.delete(input.id); clearTimeout(entry.timer);
    if (typeof input.value === 'string' && input.value.length <= MAX_INGRESS_SECRET_BYTES && !input.error) entry.resolve(input.value);
    else entry.reject(new Error('secure_storage_unavailable'));
  });
  channel.once('disconnect', () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('secure_storage_unavailable')); }
    pending.clear();
  });
  const invoke = (operation: 'seal' | 'unseal', purpose: 'credential' | 'backup', value: string): Promise<string> => {
    if (!channel.connected || !channel.send || pending.size >= 4 || value.length > MAX_INGRESS_SECRET_BYTES) {
      return Promise.reject(new Error('secure_storage_unavailable'));
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const fail = () => { const entry = pending.get(id); if (!entry) return;
        clearTimeout(entry.timer); pending.delete(id); reject(new Error('secure_storage_unavailable')); };
      const timer = setTimeout(fail, 10_000);
      pending.set(id, { resolve, reject, timer });
      channel.send!({ type: INGRESS_SECRET_REQUEST, id, operation, purpose, value }, error => { if (error) fail(); });
    });
  };
  return { seal: (purpose, value) => invoke('seal', purpose, value),
    unseal: (purpose, value) => invoke('unseal', purpose, value) };
}
