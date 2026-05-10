import type { MobileApiClient } from './client';

export interface MobileAuthPrincipalSummary {
  accountId: string;
  displayName: string;
  email: string | null;
  roles: string[];
  coreActorId: string | null;
  sessionId: string;
}

export interface MobileAuthStatusPayload {
  authenticated: boolean;
  principal: MobileAuthPrincipalSummary | null;
  token?: string;
}

export interface MobileLocalLoginInput {
  identifier: string;
  password: string;
  deviceLabel?: string;
  devicePlatform?: 'ios' | 'android' | 'web' | 'unknown';
  appVersion?: string;
}

export interface MobileGoogleLoginInput {
  idToken: string;
  deviceLabel?: string;
  devicePlatform?: 'ios' | 'android' | 'web' | 'unknown';
  appVersion?: string;
}

export function fetchMobileAuthStatus(
  client: MobileApiClient,
): Promise<MobileAuthStatusPayload> {
  return client.get<MobileAuthStatusPayload>('/api/mobile/auth/status');
}

export function loginMobileLocal(
  client: MobileApiClient,
  input: MobileLocalLoginInput,
): Promise<MobileAuthStatusPayload> {
  return client.post<MobileAuthStatusPayload>('/api/mobile/auth/login', input);
}

export function loginMobileGoogle(
  client: MobileApiClient,
  input: MobileGoogleLoginInput,
): Promise<MobileAuthStatusPayload> {
  return client.post<MobileAuthStatusPayload>('/api/mobile/auth/google/login', input);
}

export function logoutMobile(client: MobileApiClient): Promise<MobileAuthStatusPayload> {
  return client.post<MobileAuthStatusPayload>('/api/mobile/auth/logout', {});
}
