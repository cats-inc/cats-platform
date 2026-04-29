import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../build/server/config.js';
import {
  buildMobilePairingReadiness,
  MOBILE_PAIRING_BIND_OVERRIDE_ENV,
} from '../build/server/shared/mobilePairing.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createAppShell } from '../build/server/products/chat/state/shell.js';

test('mobile pairing readiness separates loopback bind from LAN discovery failures', () => {
  const readiness = buildMobilePairingReadiness({
    enabled: true,
    host: '127.0.0.1',
    port: 8181,
    networkInterfaces: {
      Ethernet: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.equal(readiness.enabled, true);
  assert.equal(readiness.bindHost, '127.0.0.1');
  assert.equal(readiness.bindPort, 8181);
  assert.equal(readiness.bindReachability, 'loopback');
  assert.equal(readiness.canReachFromLan, false);
  assert.equal(readiness.selectedLanIp, null);
  assert.equal(readiness.selectedLanUrl, null);
  assert.equal(readiness.diagnosticManifestUrl, null);
  assert.equal(readiness.noLanCandidateReason, 'loopback_bound');
  assert.equal(readiness.bindOverrideEnv, MOBILE_PAIRING_BIND_OVERRIDE_ENV);
  assert.equal(readiness.pairingUrlStatus, 'phase1_pending');
  assert.equal(readiness.pairingUrl, null);
});

test('mobile pairing readiness selects the first LAN URL for wildcard binds', () => {
  const readiness = buildMobilePairingReadiness({
    enabled: true,
    host: '0.0.0.0',
    port: 8181,
    networkInterfaces: {
      Ethernet: [
        { address: '192.168.1.25', family: 'IPv4', internal: false },
        { address: '10.0.0.8', family: 'IPv4', internal: false },
      ],
      Tailscale: [
        { address: '100.101.102.103', family: 'IPv4', internal: false },
      ],
    },
  });

  assert.equal(readiness.bindReachability, 'all_interfaces');
  assert.equal(readiness.canReachFromLan, true);
  assert.equal(readiness.selectedLanIp, '10.0.0.8');
  assert.equal(readiness.selectedLanUrl, 'http://10.0.0.8:8181');
  assert.equal(readiness.diagnosticManifestUrl, 'http://10.0.0.8:8181/api/mobile/manifest');
  assert.equal(readiness.noLanCandidateReason, null);
  assert.equal(readiness.bindOverrideEnv, null);
});

test('mobile pairing readiness does not turn non-LAN specific binds into bind override prompts', () => {
  const readiness = buildMobilePairingReadiness({
    enabled: true,
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

  assert.equal(readiness.bindReachability, 'other_interface');
  assert.equal(readiness.canReachFromLan, false);
  assert.equal(readiness.selectedLanIp, null);
  assert.equal(readiness.noLanCandidateReason, 'bind_host_not_lan_candidate');
  assert.equal(readiness.bindOverrideEnv, null);
});

test('createAppShell publishes mobile pairing readiness in the desktop payload', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-app-shell-mobile-pairing-'));
  const config = loadConfig({
    CATS_PLATFORM_DIR: path.join(root, 'platform'),
    CATS_DESKTOP_MOBILE_PAIRING_ENABLED: 'true',
    CATS_HOST: '127.0.0.1',
    CATS_PORT: '8181',
  });

  const payload = createAppShell(
    config,
    {
      baseUrl: 'http://127.0.0.1:3110',
      reachable: true,
      status: 'ok',
      service: 'cats-runtime',
    },
    createDefaultChatState(),
    new Date('2026-04-30T00:00:00.000Z'),
    {
      setupCompleteAt: null,
      ownerDisplayName: 'Owner',
      ownerAvatarColor: null,
    },
  );

  assert.equal(payload.desktop.mobilePairing.enabled, true);
  assert.equal(payload.desktop.mobilePairing.bindHost, '127.0.0.1');
  assert.equal(payload.desktop.mobilePairing.bindReachability, 'loopback');
  assert.equal(payload.desktop.mobilePairing.noLanCandidateReason, 'loopback_bound');
  assert.equal(payload.desktop.mobilePairing.bindOverrideEnv, MOBILE_PAIRING_BIND_OVERRIDE_ENV);
});
