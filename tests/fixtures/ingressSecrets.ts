import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { IngressSecretProtector } from '#cats-ingress-secrets';

/** Real encryption with a fixture-only in-memory key; never reads the OS vault. */
export function fixtureIngressSecrets(): IngressSecretProtector {
  const key = randomBytes(32);
  return {
    async seal(purpose, value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(purpose));
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
    },
    async unseal(purpose, value) {
      const bytes = Buffer.from(value, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}
