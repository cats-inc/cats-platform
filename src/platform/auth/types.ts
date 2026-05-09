export const PLATFORM_AUTH_STATE_VERSION = 1;

export type PlatformAccountStatus = 'active' | 'disabled';
export type PlatformIdentityProvider = 'local_password' | 'google';
export type PlatformSessionKind = 'browser' | 'mobile_device';
export type PlatformDevicePlatform = 'ios' | 'android' | 'web' | 'unknown';
export type PlatformMembershipRole = 'owner' | 'admin' | 'operator' | 'member';

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

export interface PlatformAuthState {
  version: typeof PLATFORM_AUTH_STATE_VERSION;
  updatedAt: string;
  accounts: PlatformAccountRecord[];
  identities: PlatformIdentityRecord[];
  sessions: PlatformSessionRecord[];
  memberships: PlatformMembershipRecord[];
}

export interface PlatformPrincipal {
  account: PlatformAccountRecord;
  membership: PlatformMembershipRecord;
  session: PlatformSessionRecord;
}
