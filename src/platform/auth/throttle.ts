import { randomUUID } from 'node:crypto';

import type { PlatformAuthState, PlatformLoginFailureProvider } from './types.js';

const LOGIN_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_FAILURE_DELAY_WINDOW_MS = 15 * 60 * 1000;
const PROGRESSIVE_DELAY_STEPS_MS = [0, 100, 250, 500, 1000] as const;

export interface PlatformLoginThrottlePolicy {
  loginFailureLimit: number;
  loginLockoutMs: number;
  accountDailyFailureCap: number;
  accountCooldownMs: number;
  subnetDailyFailureCap: number;
}

export interface PlatformLoginThrottleSubject {
  provider: PlatformLoginFailureProvider;
  accountKey: string;
  remoteAddress: string;
  subnetKey: string;
}

export type PlatformLoginThrottleBlockReason =
  | 'composite_lockout'
  | 'account_daily_cap'
  | 'subnet_daily_cap';

export type PlatformLoginThrottleEvaluation =
  | {
      blocked: false;
      delayMs: number;
    }
  | {
      blocked: true;
      reason: PlatformLoginThrottleBlockReason;
      retryAfterMs: number;
    };

export function createLoginThrottleSubject(input: {
  provider: PlatformLoginFailureProvider;
  accountKey: string;
  remoteAddress?: string | null;
}): PlatformLoginThrottleSubject {
  const remoteAddress = normalizeLoginRemoteAddress(input.remoteAddress);
  return {
    provider: input.provider,
    accountKey: normalizeLoginAccountKey(input.accountKey),
    remoteAddress,
    subnetKey: resolveLoginSubnetKey(remoteAddress),
  };
}

export function normalizeLoginAccountKey(accountKey: string): string {
  const normalized = accountKey.trim().toLowerCase();
  if (!normalized) {
    return 'unknown';
  }
  return normalized;
}

export function normalizeLoginRemoteAddress(remoteAddress?: string | null): string {
  const normalized = remoteAddress?.trim();
  if (!normalized) {
    return 'unknown';
  }
  if (normalized.startsWith('::ffff:')) {
    return normalized.slice('::ffff:'.length);
  }
  return normalized;
}

export function resolveLoginSubnetKey(remoteAddress: string): string {
  const normalized = normalizeLoginRemoteAddress(remoteAddress).toLowerCase();
  const ipv4 = parseIpv4Address(normalized);
  if (ipv4) {
    return `${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.0/24`;
  }
  if (normalized.includes(':')) {
    const address = normalized.replace(/^\[/u, '').replace(/\]$/u, '').split('%')[0]!;
    const hextets = address.split(':').filter(Boolean).slice(0, 4);
    return `${hextets.join(':')}::/64`;
  }
  return normalized;
}

export function evaluateLoginThrottle(
  state: PlatformAuthState,
  input: {
    subject: PlatformLoginThrottleSubject;
    policy: PlatformLoginThrottlePolicy;
    now?: Date;
  },
): PlatformLoginThrottleEvaluation {
  const now = input.now ?? new Date();
  const activeCooldown = findActiveCooldown(state, input.subject, now);
  if (activeCooldown) {
    return {
      blocked: true,
      reason: activeCooldown.reason,
      retryAfterMs: Math.max(1, Date.parse(activeCooldown.expiresAt) - now.getTime()),
    };
  }

  const compositeFailures = state.loginFailures.filter((failure) =>
    failure.provider === input.subject.provider
    && failure.accountKey === input.subject.accountKey
    && failure.remoteAddress === input.subject.remoteAddress
    && Date.parse(failure.failedAt) > now.getTime() - input.policy.loginLockoutMs,
  );
  if (compositeFailures.length >= input.policy.loginFailureLimit) {
    const latestFailureMs = Math.max(...compositeFailures.map((failure) =>
      Date.parse(failure.failedAt),
    ));
    return {
      blocked: true,
      reason: 'composite_lockout',
      retryAfterMs: Math.max(1, latestFailureMs + input.policy.loginLockoutMs - now.getTime()),
    };
  }

  return {
    blocked: false,
    delayMs: calculateProgressiveDelayMs(state, input.subject, now),
  };
}

export function recordFailedLogin(
  state: PlatformAuthState,
  input: {
    subject: PlatformLoginThrottleSubject;
    policy: PlatformLoginThrottlePolicy;
    now?: Date;
  },
): PlatformAuthState {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const pruned = pruneLoginThrottleState(state, now);
  const failures = [
    ...pruned.loginFailures,
    {
      id: `auth-login-failure-${randomUUID()}`,
      provider: input.subject.provider,
      accountKey: input.subject.accountKey,
      remoteAddress: input.subject.remoteAddress,
      subnetKey: input.subject.subnetKey,
      failedAt: nowIso,
    },
  ];
  const cooldowns = [...pruned.loginCooldowns];
  const compositeFailures = failures.filter((failure) =>
    failure.provider === input.subject.provider
    && failure.accountKey === input.subject.accountKey
    && failure.remoteAddress === input.subject.remoteAddress
    && Date.parse(failure.failedAt) > now.getTime() - input.policy.loginLockoutMs,
  );
  if (compositeFailures.length >= input.policy.loginFailureLimit) {
    cooldowns.push({
      id: `auth-login-cooldown-${randomUUID()}`,
      provider: input.subject.provider,
      reason: 'composite_lockout',
      accountKey: input.subject.accountKey,
      remoteAddress: input.subject.remoteAddress,
      subnetKey: null,
      createdAt: nowIso,
      expiresAt: new Date(now.getTime() + input.policy.loginLockoutMs).toISOString(),
    });
  }

  const accountFailures = failures.filter((failure) =>
    failure.provider === input.subject.provider
    && failure.accountKey === input.subject.accountKey
    && Date.parse(failure.failedAt) > now.getTime() - LOGIN_FAILURE_WINDOW_MS,
  );
  if (accountFailures.length >= input.policy.accountDailyFailureCap) {
    cooldowns.push({
      id: `auth-login-cooldown-${randomUUID()}`,
      provider: input.subject.provider,
      reason: 'account_daily_cap',
      accountKey: input.subject.accountKey,
      remoteAddress: null,
      subnetKey: null,
      createdAt: nowIso,
      expiresAt: new Date(now.getTime() + input.policy.accountCooldownMs).toISOString(),
    });
  }

  const subnetFailures = failures.filter((failure) =>
    failure.provider === input.subject.provider
    && failure.subnetKey === input.subject.subnetKey
    && Date.parse(failure.failedAt) > now.getTime() - LOGIN_FAILURE_WINDOW_MS,
  );
  if (subnetFailures.length >= input.policy.subnetDailyFailureCap) {
    cooldowns.push({
      id: `auth-login-cooldown-${randomUUID()}`,
      provider: input.subject.provider,
      reason: 'subnet_daily_cap',
      accountKey: null,
      remoteAddress: null,
      subnetKey: input.subject.subnetKey,
      createdAt: nowIso,
      expiresAt: new Date(now.getTime() + input.policy.accountCooldownMs).toISOString(),
    });
  }

  return {
    ...pruned,
    loginFailures: failures,
    loginCooldowns: mergeActiveCooldowns(cooldowns, now),
  };
}

export function recordSuccessfulLogin(
  state: PlatformAuthState,
  input: {
    subject: PlatformLoginThrottleSubject;
    now?: Date;
  },
): PlatformAuthState {
  const now = input.now ?? new Date();
  const pruned = pruneLoginThrottleState(state, now);
  return {
    ...pruned,
    loginFailures: pruned.loginFailures.filter((failure) =>
      failure.provider !== input.subject.provider
      || failure.accountKey !== input.subject.accountKey,
    ),
    loginCooldowns: pruned.loginCooldowns.filter((cooldown) =>
      cooldown.provider !== input.subject.provider
      || cooldown.accountKey !== input.subject.accountKey,
    ),
  };
}

export function pruneLoginThrottleState(
  state: PlatformAuthState,
  now: Date = new Date(),
): PlatformAuthState {
  const cutoffMs = now.getTime() - LOGIN_FAILURE_WINDOW_MS;
  return {
    ...state,
    loginFailures: state.loginFailures.filter((failure) =>
      Date.parse(failure.failedAt) > cutoffMs,
    ),
    loginCooldowns: state.loginCooldowns.filter((cooldown) =>
      Date.parse(cooldown.expiresAt) > now.getTime(),
    ),
  };
}

function calculateProgressiveDelayMs(
  state: PlatformAuthState,
  subject: PlatformLoginThrottleSubject,
  now: Date,
): number {
  const recentFailures = state.loginFailures.filter((failure) =>
    failure.provider === subject.provider
    && failure.accountKey === subject.accountKey
    && Date.parse(failure.failedAt) > now.getTime() - RECENT_FAILURE_DELAY_WINDOW_MS,
  );
  const step = Math.min(recentFailures.length, PROGRESSIVE_DELAY_STEPS_MS.length - 1);
  return PROGRESSIVE_DELAY_STEPS_MS[step]!;
}

function findActiveCooldown(
  state: PlatformAuthState,
  subject: PlatformLoginThrottleSubject,
  now: Date,
): { reason: PlatformLoginThrottleBlockReason; expiresAt: string } | null {
  return state.loginCooldowns.find((cooldown) =>
    cooldown.provider === subject.provider
    && Date.parse(cooldown.expiresAt) > now.getTime()
    && (
      (cooldown.reason === 'composite_lockout'
        && cooldown.accountKey === subject.accountKey
        && cooldown.remoteAddress === subject.remoteAddress)
      || (cooldown.reason === 'account_daily_cap'
        && cooldown.accountKey === subject.accountKey)
      || (cooldown.reason === 'subnet_daily_cap'
        && cooldown.subnetKey === subject.subnetKey)
    ),
  ) ?? null;
}

function mergeActiveCooldowns(
  cooldowns: PlatformAuthState['loginCooldowns'],
  now: Date,
): PlatformAuthState['loginCooldowns'] {
  const merged = new Map<string, PlatformAuthState['loginCooldowns'][number]>();
  for (const cooldown of cooldowns) {
    if (Date.parse(cooldown.expiresAt) <= now.getTime()) {
      continue;
    }
    const key = [
      cooldown.provider,
      cooldown.reason,
      cooldown.accountKey ?? '',
      cooldown.remoteAddress ?? '',
      cooldown.subnetKey ?? '',
    ].join('\u001f');
    const existing = merged.get(key);
    if (!existing || Date.parse(cooldown.expiresAt) > Date.parse(existing.expiresAt)) {
      merged.set(key, cooldown);
    }
  }
  return [...merged.values()];
}

function parseIpv4Address(address: string): [number, number, number, number] | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet, index) =>
    !/^\d{1,3}$/u.test(parts[index]!)
    || !Number.isInteger(octet)
    || octet < 0
    || octet > 255
  )) {
    return null;
  }
  return octets as [number, number, number, number];
}
