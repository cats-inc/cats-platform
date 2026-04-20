import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizePlatformIngress } from '../build/server/app/server/platformIngressSummary.js';

test('summarizePlatformIngress reports loopback-only bindings as not LAN reachable', () => {
  const summary = summarizePlatformIngress({
    host: '127.0.0.1',
    port: 8181,
    networkInterfaces: {
      Ethernet: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.deepEqual(summary.binding, {
    host: '127.0.0.1',
    port: 8181,
    mode: 'loopback',
    canReachFromLan: false,
  });
  assert.deepEqual(summary.urls.localUrls, ['http://127.0.0.1:8181']);
  assert.deepEqual(summary.urls.lanUrls, []);
  assert.deepEqual(summary.urls.overlayUrls, []);
  assert.equal(summary.runtimeIngress.rootPath, '/runtime');
  assert.equal(summary.runtimeIngress.apiBasePath, '/runtime/api');
  assert.match(summary.notes[0] ?? '', /loopback-only/u);
});

test('summarizePlatformIngress lists LAN candidate URLs for wildcard bindings', () => {
  const summary = summarizePlatformIngress({
    host: '0.0.0.0',
    port: 8181,
    networkInterfaces: {
      Loopback: [
        { address: '127.0.0.1', family: 'IPv4', internal: true },
      ],
      Ethernet: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
        { address: '10.0.0.8', family: 'IPv4', internal: false },
      ],
      Tailscale: [
        { address: '100.101.102.103', family: 'IPv4', internal: false },
      ],
      Wsl: [
        { address: '172.20.80.1', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.deepEqual(summary.binding, {
    host: '0.0.0.0',
    port: 8181,
    mode: 'wildcard',
    canReachFromLan: true,
  });
  assert.deepEqual(summary.urls.localUrls, ['http://127.0.0.1:8181']);
  assert.deepEqual(summary.urls.lanUrls, [
    'http://10.0.0.8:8181',
    'http://192.168.1.25:8181',
  ]);
  assert.deepEqual(summary.urls.overlayUrls, [
    'http://100.101.102.103:8181',
  ]);
  assert.ok(summary.notes.some((note) => /wildcard/u.test(note)));
  assert.ok(summary.notes.some((note) => /Overlay URLs/u.test(note)));
  assert.ok(summary.notes.some((note) => /virtual adapter IPv4 addresses/u.test(note)));
});

test('summarizePlatformIngress keeps only the matched LAN URL for specific host binds', () => {
  const summary = summarizePlatformIngress({
    host: '192.168.1.25',
    port: 8181,
    networkInterfaces: {
      Ethernet: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
        { address: '10.0.0.8', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.deepEqual(summary.binding, {
    host: '192.168.1.25',
    port: 8181,
    mode: 'specific',
    canReachFromLan: true,
  });
  assert.deepEqual(summary.urls.localUrls, ['http://192.168.1.25:8181']);
  assert.deepEqual(summary.urls.lanUrls, ['http://192.168.1.25:8181']);
  assert.deepEqual(summary.urls.overlayUrls, []);
  assert.ok(summary.notes.some((note) => /LAN-visible/u.test(note)));
});

test('summarizePlatformIngress reports trusted overlay binds without mislabeling them as LAN-visible', () => {
  const summary = summarizePlatformIngress({
    host: '100.101.102.103',
    port: 8181,
    networkInterfaces: {
      Tailscale: [
        { address: '100.101.102.103', family: 'IPv4', internal: false },
      ],
      Ethernet: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.deepEqual(summary.binding, {
    host: '100.101.102.103',
    port: 8181,
    mode: 'specific',
    canReachFromLan: false,
  });
  assert.deepEqual(summary.urls.localUrls, ['http://100.101.102.103:8181']);
  assert.deepEqual(summary.urls.lanUrls, []);
  assert.deepEqual(summary.urls.overlayUrls, ['http://100.101.102.103:8181']);
  assert.ok(summary.notes.some((note) => /trusted overlay interface/u.test(note)));
  assert.ok(summary.notes.some((note) => /Overlay URLs/u.test(note)));
});

test('summarizePlatformIngress classifies WireGuard and ZeroTier interfaces as overlay', () => {
  const summary = summarizePlatformIngress({
    host: '0.0.0.0',
    port: 8181,
    networkInterfaces: {
      wg0: [
        { address: '10.200.0.7', family: 'IPv4', internal: false },
      ],
      zt0abcdef: [
        { address: '10.147.20.5', family: 'IPv4', internal: false },
      ],
      en0: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.deepEqual(summary.urls.lanUrls, ['http://192.168.1.25:8181']);
  assert.deepEqual(summary.urls.overlayUrls, [
    'http://10.147.20.5:8181',
    'http://10.200.0.7:8181',
  ]);
});

test('summarizePlatformIngress does not blanket-classify macOS utun* as trusted overlay', () => {
  const summary = summarizePlatformIngress({
    host: '0.0.0.0',
    port: 8181,
    networkInterfaces: {
      utun3: [
        { address: '100.64.1.1', family: 'IPv4', internal: false },
      ],
      utun7: [
        { address: '10.99.0.5', family: 'IPv4', internal: false },
      ],
      en0: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.deepEqual(summary.urls.overlayUrls, []);
  assert.ok(!summary.urls.overlayUrls.some((url) => url.includes('100.64.1.1')));
  assert.ok(!summary.urls.overlayUrls.some((url) => url.includes('10.99.0.5')));
  assert.ok(summary.urls.lanUrls.includes('http://192.168.1.25:8181'));
});

test('summarizePlatformIngress treats Linux docker bridges and VirtualBox host-only nets as virtual', () => {
  const summary = summarizePlatformIngress({
    host: '0.0.0.0',
    port: 8181,
    networkInterfaces: {
      'br-abc123': [
        { address: '172.18.0.1', family: 'IPv4', internal: false },
      ],
      vboxnet0: [
        { address: '192.168.56.1', family: 'IPv4', internal: false },
      ],
      eth0: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.deepEqual(summary.urls.lanUrls, ['http://192.168.1.25:8181']);
  assert.deepEqual(summary.urls.overlayUrls, []);
  assert.ok(
    summary.notes.some((note) => /virtual adapter IPv4 addresses/u.test(note)),
  );
});
