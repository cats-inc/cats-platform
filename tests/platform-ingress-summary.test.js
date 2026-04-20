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
    'http://172.20.80.1:8181',
    'http://192.168.1.25:8181',
  ]);
  assert.match(summary.notes[0] ?? '', /wildcard/u);
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
  assert.match(summary.notes[0] ?? '', /LAN-visible/u);
});
