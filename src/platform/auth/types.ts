export const PLATFORM_AUTH_STATE_VERSION = 1;

export type PlatformAccountStatus = 'active' | 'disabled';
export type PlatformIdentityProvider = 'local_password' | 'google';
export type PlatformSessionKind = 'browser' | 'mobile_device';
export type PlatformDevicePlatform = 'ios' | 'android' | 'web' | 'unknown';
export type PlatformMembershipRole = 'owner' | 'admin' | 'operator' | 'member';
export type PlatformLoginFailureProvider = PlatformIdentityProvider;
export type PlatformLoginCooldownReason =
  | 'composite_lockout'
  | 'account_daily_cap'
  | 'subnet_daily_cap';

export interface PlatformAccountRecord {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  status: PlatformAccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformIdentityRecord {
  id: string;
  accountId: string;
  provider: PlatformIdentityProvider;
  providerSubject: string;
  email: string | null;
  passwordHash?: string;
  passwordHashAlgorithm?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSessionRecord {
  id: string;
  accountId: string;
  kind: PlatformSessionKind;
  tokenHash: string;
  csrfTokenHash?: string;
  deviceLabel?: string;
  devicePlatform?: PlatformDevicePlatform;
  appVersion?: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
  lastSeenAddress?: string;
}

export interface PlatformMembershipRecord {
  id: string;
  accountId: string;
  roles: PlatformMembershipRole[];
  coreActorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformLoginFailureRecord {
  id: string;
  provider: PlatformLoginFailureProvider;
  accountKey: string;
  remoteAddress: string;
  subnetKey: string;
  failedAt: string;
}

export interface PlatformLoginCooldownRecord {
  id: string;
  reason: PlatformLoginCooldownReason;
  provider: PlatformLoginFailureProvider;
  accountKey: string | null;
  remoteAddress: string | null;
  subnetKey: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface PlatformAuthState {
  version: typeof PLATFORM_AUTH_STATE_VERSION;
  updatedAt: string;
  accounts: PlatformAccountRecord[];
  identities: PlatformIdentityRecord[];
  sessions: PlatformSessionRecord[];
  memberships: PlatformMembershipRecord[];
  loginFailures: PlatformLoginFailureRecord[];
  loginCooldowns: PlatformLoginCooldownRecord[];
}

export interface PlatformPrincipal {
  account: PlatformAccountRecord;
  membership: PlatformMembershipRecord;
  session: PlatformSessionRecord;
}
