import type { PlatformAuthMode } from './config.js';

export type EffectivePlatformAuthGateMode =
  | { status: 'enabled' }
  | { status: 'unsafe_disabled' }
  | { status: 'configuration_error'; message: string };

export function resolveEffectivePlatformAuthGateMode(input: {
  configuredMode: PlatformAuthMode;
  host: string;
  setupCompleteAt: string | null;
}): EffectivePlatformAuthGateMode {
  if (input.configuredMode !== 'unsafe_disabled') {
    return { status: 'enabled' };
  }
  if (input.setupCompleteAt !== null) {
    return {
      status: 'configuration_error',
      message: 'CATS_AUTH_ENABLED=false is not allowed after setup is complete.',
    };
  }
  if (!isLoopbackAuthHost(input.host)) {
    return {
      status: 'configuration_error',
      message: 'CATS_AUTH_ENABLED=false is allowed only on loopback before setup is complete.',
    };
  }
  return { status: 'unsafe_disabled' };
}

export function isLoopbackAuthHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '');
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '0:0:0:0:0:0:0:1';
}
