/**
 * Secret-free identity-lifecycle security events.
 *
 * ADR-111 section 7 requires these to be emitted through an injected reporter
 * so a later audit sink can persist the same events without rewriting the auth
 * routes. The payload is deliberately narrow: stable Cats identifiers, an
 * outcome, and a bounded reason code. Passwords, raw session or action tokens,
 * Google credentials, and provider-token claims must never reach a reporter.
 */

export const PLATFORM_AUTH_SECURITY_EVENT_KINDS = [
  'first_admin_created',
  'step_up_succeeded',
  'step_up_failed',
  'google_link_succeeded',
  'google_link_failed',
  'google_unlink_succeeded',
  'google_unlink_failed',
] as const;

export type PlatformAuthSecurityEventKind =
  (typeof PLATFORM_AUTH_SECURITY_EVENT_KINDS)[number];

export type PlatformAuthSecurityEventOutcome = 'success' | 'failure';

export interface PlatformAuthSecurityEvent {
  kind: PlatformAuthSecurityEventKind;
  outcome: PlatformAuthSecurityEventOutcome;
  occurredAt: string;
  accountId: string | null;
  sessionId: string | null;
  reason: string | null;
}

export type PlatformAuthSecurityEventReporter = (
  event: PlatformAuthSecurityEvent,
) => void | Promise<void>;

export interface CreatePlatformAuthSecurityEventInput {
  kind: PlatformAuthSecurityEventKind;
  outcome: PlatformAuthSecurityEventOutcome;
  now: Date;
  accountId?: string | null;
  sessionId?: string | null;
  reason?: string | null;
}

const MAX_REASON_LENGTH = 64;

export function createPlatformAuthSecurityEvent(
  input: CreatePlatformAuthSecurityEventInput,
): PlatformAuthSecurityEvent {
  return {
    kind: input.kind,
    outcome: input.outcome,
    occurredAt: input.now.toISOString(),
    accountId: input.accountId ?? null,
    sessionId: input.sessionId ?? null,
    reason: normalizeReason(input.reason),
  };
}

/**
 * Reason codes are machine-readable slugs, never free text a caller supplied.
 * Anything longer than a slug is dropped rather than truncated so an unexpected
 * value cannot smuggle credential material into a log line.
 */
function normalizeReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_REASON_LENGTH || !/^[a-z0-9_]+$/u.test(trimmed)) {
    return 'unspecified';
  }
  return trimmed;
}
