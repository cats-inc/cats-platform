import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashSessionToken, verifySessionTokenHash } from './session.js';
import type { PlatformAuthReadiness, PlatformAuthRepairReason } from './readiness.js';

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

export interface PlatformAuthRepairStartupLog {
  status: 'repair_mode_started';
  repairReason: PlatformAuthRepairReason;
  recoveryTokenPath: string;
  issuedAt: string;
}

export interface PlatformAuthRepairStartupResult {
  tokenState: PlatformAuthRecoveryTokenState;
  localConsoleToken: string;
  structuredLog: PlatformAuthRepairStartupLog;
}

export type PlatformAuthRepairAuthorization =
  | {
      allowed: true;
      mode: 'recovery_token';
      consumedTokenState: PlatformAuthRecoveryTokenState;
    }
  | {
      allowed: false;
      reason:
        | 'missing_session_secret'
        | 'missing_recovery_token'
        | 'invalid_recovery_token';
    };

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

export function authorizePlatformAuthRepairBootstrap(input: {
  remoteAddress: string | null | undefined;
  recoveryToken: string | null | undefined;
  recoveryTokenState: PlatformAuthRecoveryTokenState | null;
  sessionSecret: string | null;
  now?: Date;
}): PlatformAuthRepairAuthorization {
  if (!input.recoveryToken) {
    return {
      allowed: false,
      reason: 'missing_recovery_token',
    };
  }
  if (!input.sessionSecret) {
    return {
      allowed: false,
      reason: 'missing_session_secret',
    };
  }
  if (!verifyPlatformAuthRecoveryToken({
    state: input.recoveryTokenState,
    token: input.recoveryToken,
    sessionSecret: input.sessionSecret,
  })) {
    return {
      allowed: false,
      reason: 'invalid_recovery_token',
    };
  }
  return {
    allowed: true,
    mode: 'recovery_token',
    consumedTokenState: consumePlatformAuthRecoveryToken(
      input.recoveryTokenState!,
      input.now ?? new Date(),
    ),
  };
}

export async function startPlatformAuthRepairMode(input: {
  readiness: PlatformAuthReadiness;
  sessionSecret: string | null;
  recoveryTokenPath: string;
  now?: Date;
}): Promise<PlatformAuthRepairStartupResult | null> {
  if (!input.readiness.repairRequired || !input.readiness.repairReason) {
    return null;
  }
  if (!input.sessionSecret) {
    throw new Error('CATS_AUTH_SESSION_SECRET is required to issue an auth repair token.');
  }
  const issued = await issuePlatformAuthRecoveryToken({
    sessionSecret: input.sessionSecret,
    recoveryTokenPath: input.recoveryTokenPath,
    now: input.now,
  });
  return {
    tokenState: issued.state,
    localConsoleToken: issued.token,
    structuredLog: {
      status: 'repair_mode_started',
      repairReason: input.readiness.repairReason,
      recoveryTokenPath: input.recoveryTokenPath,
      issuedAt: issued.state.issuedAt,
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
