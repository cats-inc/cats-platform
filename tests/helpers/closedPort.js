import { once } from 'node:events';
import { createServer } from 'node:net';

/**
 * Reserves an ephemeral port and releases it, yielding a port nothing listens on.
 *
 * Use this instead of a hardcoded port whenever a test asserts that something is
 * *unreachable*. A fixed port cannot carry that guarantee: `127.0.0.1:3110` is
 * the Cats runtime port, so on any developer machine running Cats the assertion
 * quietly tests the opposite of what it claims, and the test fails locally while
 * passing in CI.
 *
 * The port is not held open, so nothing stops another process from claiming it
 * afterwards. The OS does not hand out a just-released ephemeral port
 * immediately, which is enough for a test process.
 */
export async function reserveClosedPort(host = '127.0.0.1') {
  const probe = createServer();
  probe.listen(0, host);
  await once(probe, 'listening');

  const address = probe.address();
  if (!address || typeof address === 'string') {
    probe.close();
    throw new Error('Failed to reserve a closed port: no numeric address');
  }

  const { port } = address;
  probe.close();
  await once(probe, 'close');
  return port;
}

/** Convenience form for config fields that want a base URL. */
export async function reserveClosedBaseUrl(host = '127.0.0.1') {
  return `http://${host}:${await reserveClosedPort(host)}`;
}
