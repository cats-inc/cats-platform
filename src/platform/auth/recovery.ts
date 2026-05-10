import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashSessionToken, verifySessionTokenHash } from './session.js';

export interface PlatformAuthRecoveryTokenState {
  tokenHash: string;
  issuedAt: string;
  recoveryTokenPath: string;
  consumedAt: string | null;
}

export interface PlatformAuthRecoveryTokenIssueResult {
  state: PlatformAuthRecoveryTokenState;
  token: string;
}

export async function issuePlatformAuthRecoveryToken(input: {
  sessionSecret: string;
  recoveryTokenPath: string;
  now?: Date;
}): Promise<PlatformAuthRecoveryTokenIssueResult> {
  const token = randomBytes(32).toString('base64url');
  const now = input.now ?? new Date();
  await mkdir(path.dirname(input.recoveryTokenPath), { recursive: true });
  await writeFile(input.recoveryTokenPath, `${token}\n`, { encoding: 'utf-8', mode: 0o600 });
  await chmodRecoveryTokenFile(input.recoveryTokenPath);
  return {
    token,
    state: {
      tokenHash: hashSessionToken(token, input.sessionSecret),
      issuedAt: now.toISOString(),
      recoveryTokenPath: input.recoveryTokenPath,
      consumedAt: null,
    },
  };
}

export function verifyPlatformAuthRecoveryToken(input: {
  state: PlatformAuthRecoveryTokenState | null;
  token: string | null | undefined;
  sessionSecret: string;
}): boolean {
  return Boolean(
    input.state
    && input.state.consumedAt === null
    && input.token
    && verifySessionTokenHash(input.token, input.state.tokenHash, input.sessionSecret),
  );
}

export function consumePlatformAuthRecoveryToken(
  state: PlatformAuthRecoveryTokenState,
  now: Date = new Date(),
): PlatformAuthRecoveryTokenState {
  return {
    ...state,
    consumedAt: state.consumedAt ?? now.toISOString(),
  };
}

async function chmodRecoveryTokenFile(recoveryTokenPath: string): Promise<void> {
  try {
    await chmod(recoveryTokenPath, 0o600);
  } catch {
    // Windows and some filesystems do not support POSIX mode updates.
  }
}
