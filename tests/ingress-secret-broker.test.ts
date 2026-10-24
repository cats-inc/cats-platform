import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { createIngressSecretProtector, attachIngressSecretBroker } from '../desktop/host/ingressSecrets.ts';
import { createIngressSecretClient } from '../src/platform/apps/ingressSecretClient.ts';

function osStorage() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString(value: string) {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    },
    decryptString(value: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(-16));
      return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]).toString('utf8');
    },
  };
}
test('OS envelopes bind profile and purpose, and reject insecure Linux or unavailable storage', async () => {
  const storage = osStorage();
  const first = createIngressSecretProtector(storage, 'fixture-profile-one', 'win32');
  const second = createIngressSecretProtector(storage, 'fixture-profile-two', 'win32');
  const value = 'fixture-private-token-12345';
  const sealed = await first.seal('credential', value);
  assert.equal(sealed.includes(value), false);
  assert.equal(await first.unseal('credential', sealed), value);
  await assert.rejects(second.unseal('credential', sealed), /invalid_secret/);
  await assert.rejects(first.unseal('backup', sealed), /invalid_secret/);
  const unavailable = createIngressSecretProtector({ ...storage, isEncryptionAvailable: () => false }, 'fixture', 'win32');
  await assert.rejects(unavailable.seal('credential', value), /secure_storage_unavailable/);
  const basic = createIngressSecretProtector({ ...storage, getSelectedStorageBackend: () => 'basic_text' }, 'fixture', 'linux');
  await assert.rejects(basic.seal('credential', value), /secure_storage_unavailable/);
});

test('private child IPC correlates requests without exposing generic renderer encryption', async () => {
  const parent = new EventEmitter() as EventEmitter & { connected: boolean; send(value: unknown, callback: (error: Error | null) => void): void };
  const child = new EventEmitter() as typeof parent;
  parent.connected = child.connected = true;
  parent.send = (value, callback) => { queueMicrotask(() => child.emit('message', value)); callback(null); };
  child.send = (value, callback) => { queueMicrotask(() => parent.emit('message', value)); callback(null); };
  // These deliberately partial channels model only Node's IPC interface.
  attachIngressSecretBroker(child as unknown as ChildProcess, createIngressSecretProtector(osStorage(), 'fixture', 'win32'));
  const client = createIngressSecretClient(parent as unknown as NodeJS.Process);
  const values = ['fixture-one', 'fixture-two'];
  const sealed = await Promise.all(values.map(value => client.seal('credential', value)));
  assert.deepEqual(await Promise.all(sealed.map(value => client.unseal('credential', value))), values);
  const pending = client.seal('backup', 'fixture');
  parent.connected = false; parent.emit('disconnect');
  await assert.rejects(pending, /secure_storage_unavailable/);
  await assert.rejects(client.seal('credential', 'fixture'), /secure_storage_unavailable/);
  child.emit('exit');
});
