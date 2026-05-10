import {
  PLATFORM_AUTH_STATE_VERSION,
  type PlatformAccountRecord,
  type PlatformAuthState,
  type PlatformIdentityRecord,
  type PlatformLoginCooldownRecord,
  type PlatformLoginFailureRecord,
  type PlatformMembershipRecord,
  type PlatformSessionRecord,
} from './types.js';

export type PlatformAuthStateReadStatus =
  | { status: 'ready'; state: PlatformAuthState }
  | { status: 'missing' }
  | { status: 'corrupt'; error: Error };

export class PlatformAuthStateCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformAuthStateCorruptError';
  }
}

export function createEmptyPlatformAuthState(
  now: Date = new Date(),
): PlatformAuthState {
  return {
    version: PLATFORM_AUTH_STATE_VERSION,
    updatedAt: now.toISOString(),
    accounts: [],
    identities: [],
    sessions: [],
    memberships: [],
    loginFailures: [],
    loginCooldowns: [],
  };
}

export function clonePlatformAuthState(state: PlatformAuthState): PlatformAuthState {
  return structuredClone(state);
}

export function normalizePlatformAuthState(
  input: unknown,
): PlatformAuthState {
  const record = readRecord(input, 'auth state');
  const version = record.version;
  if (version !== PLATFORM_AUTH_STATE_VERSION) {
    if (typeof version === 'number' && version > PLATFORM_AUTH_STATE_VERSION) {
      throw new PlatformAuthStateCorruptError(
        `Auth state version ${version} is newer than supported version ${PLATFORM_AUTH_STATE_VERSION}.`,
      );
    }
    throw new PlatformAuthStateCorruptError('Auth state version is missing or unsupported.');
  }

  return {
    version: PLATFORM_AUTH_STATE_VERSION,
    updatedAt: readString(record.updatedAt, 'updatedAt'),
    accounts: readArray(record.accounts, 'accounts').map(readAccountRecord),
    identities: readArray(record.identities, 'identities').map(readIdentityRecord),
    sessions: readArray(record.sessions, 'sessions').map(readSessionRecord),
    memberships: readArray(record.memberships, 'memberships').map(readMembershipRecord),
    loginFailures: readOptionalArray(record.loginFailures, 'loginFailures').map(
      readLoginFailureRecord,
    ),
    loginCooldowns: readOptionalArray(record.loginCooldowns, 'loginCooldowns').map(
      readLoginCooldownRecord,
    ),
  };
}

function readAccountRecord(input: unknown): PlatformAccountRecord {
  const record = readRecord(input, 'account');
  const status = readString(record.status, 'account.status');
  if (status !== 'active' && status !== 'disabled') {
    throw new PlatformAuthStateCorruptError(`Invalid account status: ${status}.`);
  }
  return {
    id: readString(record.id, 'account.id'),
    displayName: readString(record.displayName, 'account.displayName'),
    email: readNullableString(record.email, 'account.email'),
    avatarUrl: readNullableString(record.avatarUrl, 'account.avatarUrl'),
    status,
    createdAt: readString(record.createdAt, 'account.createdAt'),
    updatedAt: readString(record.updatedAt, 'account.updatedAt'),
  };
}

function readIdentityRecord(input: unknown): PlatformIdentityRecord {
  const record = readRecord(input, 'identity');
  const provider = readString(record.provider, 'identity.provider');
  if (provider !== 'local_password' && provider !== 'google') {
    throw new PlatformAuthStateCorruptError(`Invalid identity provider: ${provider}.`);
  }
  const identity: PlatformIdentityRecord = {
    id: readString(record.id, 'identity.id'),
    accountId: readString(record.accountId, 'identity.accountId'),
    provider,
    providerSubject: readString(record.providerSubject, 'identity.providerSubject'),
    email: readNullableString(record.email, 'identity.email'),
    createdAt: readString(record.createdAt, 'identity.createdAt'),
    updatedAt: readString(record.updatedAt, 'identity.updatedAt'),
  };
  const passwordHash = readOptionalString(record.passwordHash, 'identity.passwordHash');
  const passwordHashAlgorithm = readOptionalString(
    record.passwordHashAlgorithm,
    'identity.passwordHashAlgorithm',
  );
  if (passwordHash !== undefined) {
    identity.passwordHash = passwordHash;
  }
  if (passwordHashAlgorithm !== undefined) {
    identity.passwordHashAlgorithm = passwordHashAlgorithm;
  }
  return identity;
}

function readSessionRecord(input: unknown): PlatformSessionRecord {
  const record = readRecord(input, 'session');
  const kind = readString(record.kind, 'session.kind');
  if (kind !== 'browser' && kind !== 'mobile_device') {
    throw new PlatformAuthStateCorruptError(`Invalid session kind: ${kind}.`);
  }
  const session: PlatformSessionRecord = {
    id: readString(record.id, 'session.id'),
    accountId: readString(record.accountId, 'session.accountId'),
    kind,
    tokenHash: readString(record.tokenHash, 'session.tokenHash'),
    createdAt: readString(record.createdAt, 'session.createdAt'),
    expiresAt: readString(record.expiresAt, 'session.expiresAt'),
    revokedAt: readNullableString(record.revokedAt, 'session.revokedAt'),
    lastSeenAt: readString(record.lastSeenAt, 'session.lastSeenAt'),
  };
  const csrfTokenHash = readOptionalString(record.csrfTokenHash, 'session.csrfTokenHash');
  if (csrfTokenHash !== undefined) {
    session.csrfTokenHash = csrfTokenHash;
  }
  const deviceLabel = readOptionalString(record.deviceLabel, 'session.deviceLabel');
  if (deviceLabel !== undefined) {
    session.deviceLabel = deviceLabel;
  }
  const devicePlatform = readOptionalString(record.devicePlatform, 'session.devicePlatform');
  if (devicePlatform !== undefined) {
    if (!['ios', 'android', 'web', 'unknown'].includes(devicePlatform)) {
      throw new PlatformAuthStateCorruptError(`Invalid device platform: ${devicePlatform}.`);
    }
    session.devicePlatform = devicePlatform as PlatformSessionRecord['devicePlatform'];
  }
  const appVersion = readOptionalString(record.appVersion, 'session.appVersion');
  if (appVersion !== undefined) {
    session.appVersion = appVersion;
  }
  const lastSeenAddress = readOptionalString(record.lastSeenAddress, 'session.lastSeenAddress');
  if (lastSeenAddress !== undefined) {
    session.lastSeenAddress = lastSeenAddress;
  }
  return session;
}

function readMembershipRecord(input: unknown): PlatformMembershipRecord {
  const record = readRecord(input, 'membership');
  const roles = readArray(record.roles, 'membership.roles').map((role) => {
    const value = readString(role, 'membership.roles[]');
    if (!['owner', 'admin', 'operator', 'member'].includes(value)) {
      throw new PlatformAuthStateCorruptError(`Invalid membership role: ${value}.`);
    }
    return value as PlatformMembershipRecord['roles'][number];
  });
  return {
    id: readString(record.id, 'membership.id'),
    accountId: readString(record.accountId, 'membership.accountId'),
    roles,
    coreActorId: readNullableString(record.coreActorId, 'membership.coreActorId'),
    createdAt: readString(record.createdAt, 'membership.createdAt'),
    updatedAt: readString(record.updatedAt, 'membership.updatedAt'),
  };
}

function readLoginFailureRecord(input: unknown): PlatformLoginFailureRecord {
  const record = readRecord(input, 'loginFailure');
  const provider = readIdentityProvider(record.provider, 'loginFailure.provider');
  return {
    id: readString(record.id, 'loginFailure.id'),
    provider,
    accountKey: readString(record.accountKey, 'loginFailure.accountKey'),
    remoteAddress: readString(record.remoteAddress, 'loginFailure.remoteAddress'),
    subnetKey: readString(record.subnetKey, 'loginFailure.subnetKey'),
    failedAt: readString(record.failedAt, 'loginFailure.failedAt'),
  };
}

function readLoginCooldownRecord(input: unknown): PlatformLoginCooldownRecord {
  const record = readRecord(input, 'loginCooldown');
  const reason = readString(record.reason, 'loginCooldown.reason');
  if (!['composite_lockout', 'account_daily_cap', 'subnet_daily_cap'].includes(reason)) {
    throw new PlatformAuthStateCorruptError(`Invalid login cooldown reason: ${reason}.`);
  }
  const provider = readIdentityProvider(record.provider, 'loginCooldown.provider');
  return {
    id: readString(record.id, 'loginCooldown.id'),
    reason: reason as PlatformLoginCooldownRecord['reason'],
    provider,
    accountKey: readNullableString(record.accountKey, 'loginCooldown.accountKey'),
    remoteAddress: readNullableString(record.remoteAddress, 'loginCooldown.remoteAddress'),
    subnetKey: readNullableString(record.subnetKey, 'loginCooldown.subnetKey'),
    createdAt: readString(record.createdAt, 'loginCooldown.createdAt'),
    expiresAt: readString(record.expiresAt, 'loginCooldown.expiresAt'),
  };
}

function readRecord(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new PlatformAuthStateCorruptError(`${label} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function readIdentityProvider(
  input: unknown,
  label: string,
): PlatformLoginFailureRecord['provider'] {
  const provider = readString(input, label);
  if (provider !== 'local_password' && provider !== 'google') {
    throw new PlatformAuthStateCorruptError(`Invalid identity provider: ${provider}.`);
  }
  return provider;
}

function readArray(input: unknown, label: string): unknown[] {
  if (!Array.isArray(input)) {
    throw new PlatformAuthStateCorruptError(`${label} must be an array.`);
  }
  return input;
}

function readOptionalArray(input: unknown, label: string): unknown[] {
  if (input === undefined) {
    return [];
  }
  return readArray(input, label);
}

function readString(input: unknown, label: string): string {
  if (typeof input !== 'string') {
    throw new PlatformAuthStateCorruptError(`${label} must be a string.`);
  }
  return input;
}

function readOptionalString(input: unknown, label: string): string | undefined {
  if (input === undefined) {
    return undefined;
  }
  return readString(input, label);
}

function readNullableString(input: unknown, label: string): string | null {
  if (input === null || input === undefined) {
    return null;
  }
  return readString(input, label);
}
