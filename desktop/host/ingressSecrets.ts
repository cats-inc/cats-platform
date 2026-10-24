import type { ChildProcess } from 'node:child_process';
import {
  INGRESS_SECRET_REQUEST, INGRESS_SECRET_RESPONSE, MAX_INGRESS_SECRET_BYTES,
  isIngressSecretRequest, type IngressSecretProtector, type IngressSecretPurpose,
} from '#cats-ingress-secrets';

interface OsStorage {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

/** Electron 41 safeStorage; reject Linux's deliberately unprotected backend. */
export function createIngressSecretProtector(storage: OsStorage, profile: string,
  platform: NodeJS.Platform = process.platform): IngressSecretProtector {
  const ready = () => {
    if (!storage.isEncryptionAvailable()
      || (platform === 'linux' && (!storage.getSelectedStorageBackend
        || ['basic_text', 'unknown'].includes(storage.getSelectedStorageBackend())))) {
      throw new Error('secure_storage_unavailable');
    }
  };
  return {
    async seal(purpose, value) {
      ready();
      if (value.length > MAX_INGRESS_SECRET_BYTES / 2) throw new Error('invalid_secret');
      const payload = JSON.stringify({ schemaVersion: 1, profile, purpose, value });
      return storage.encryptString(payload).toString('base64');
    },
    async unseal(purpose, value) {
      ready();
      if (value.length > MAX_INGRESS_SECRET_BYTES || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('invalid_secret');
      try {
        const payload: unknown = JSON.parse(storage.decryptString(Buffer.from(value, 'base64')));
        const input = payload as { schemaVersion?: unknown; profile?: unknown; purpose?: unknown; value?: unknown };
        if (input.schemaVersion !== 1 || input.profile !== profile || input.purpose !== purpose
          || typeof input.value !== 'string') throw new Error('invalid_secret');
        return input.value;
      } catch { throw new Error('invalid_secret'); }
    },
  };
}

/** Only attach to the supervisor's owned Platform child, never Runtime/App children. */
export function attachIngressSecretBroker(child: ChildProcess, protector: IngressSecretProtector) {
  let active = 0;
  let closed = false;
  const send = (value: { type: string; id: string; value?: string; error?: string }) => {
    if (!closed && child.connected) child.send?.(value, () => {});
  };
  const receive = (message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)
      || message.type !== INGRESS_SECRET_REQUEST) return;
    if (!isIngressSecretRequest(message) || active >= 4) return;
    active++;
    void protector[message.operation](message.purpose as IngressSecretPurpose, message.value)
      .then(value => send({ type: INGRESS_SECRET_RESPONSE, id: message.id, value }),
        () => send({ type: INGRESS_SECRET_RESPONSE, id: message.id, error: 'secure_storage_unavailable' }))
      .finally(() => { active--; });
  };
  child.on('message', receive);
  child.once('exit', () => { closed = true; child.off('message', receive); });
}
