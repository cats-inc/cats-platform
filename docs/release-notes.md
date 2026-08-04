# Release Notes

> Operator-facing behavior changes and migration notes for Cats Platform.

Newest dates go first. Each dated section should include behavior changes,
migration steps, and any deprecations introduced in that release.

Use this shape for new entries:

```md
## YYYY-MM-DD

### Change title

Behavior change:

Migration steps:

Deprecations:
```

## 2026-08-04

### Packaged Desktop provisions its first-run auth secret

Behavior change:

Clean Cats Desktop installs no longer require an operator-created `.env` before
the first-admin setup form can complete. When no explicit
`CATS_AUTH_SESSION_SECRET` is configured, Desktop generates a 256-bit secret,
persists it in the user-local platform config directory, reuses it across
launches, and injects it only into the `cats-platform` sidecar. Persistence uses
an atomic replacement; invalid files are quarantined and regenerated. Real I/O
failures now open the existing retryable bootstrap recovery page instead of
terminating before a window appears. Platform-launched project processes strip
the host-only secret from their environment, and the Windows installer smoke
check honors custom Desktop/platform data roots.

Migration steps:

None for packaged Desktop. Existing explicit secrets remain authoritative and
are not overwritten. Self-hosted/dev deployments must continue to configure
their own `CATS_AUTH_SESSION_SECRET`.

Deprecations:

None.

## 2026-05-10

### Platform auth rollout in progress

Behavior change:

PLAN-089 server-side auth foundations now include the global route gate.
Browser local login/logout/status and Cats Mobile bearer login/logout/status
routes exist, setup-complete missing/corrupt auth state enters a constrained
repair path through `POST /api/auth/repair/first-admin`, and protected
Chat/Work/Code/Core/runtime/shell/transport APIs reject unauthenticated
requests before product dispatch. Setup-complete unauthenticated app-shell
reads return only the minimal setup/auth bootstrap envelope.

Migration steps:

Set `CATS_AUTH_SESSION_SECRET` before testing first-admin local login or mobile
bearer sessions. Keep `CATS_AUTH_ALLOWED_BROWSER_ORIGINS` explicit for every
trusted browser origin that may submit setup/login/repair/Google credential
POST requests.

Do not rely on `CATS_AUTH_ENABLED=false`; it is an unsafe dev/test escape hatch
and is rejected after `setupCompleteAt` exists. When an operator forgets the
only admin credential, delete only
`<platform-state-dir>/auth-state.local.json`, restart, and complete repair from
the one-time token written to
`<platform-state-dir>/auth-recovery-token.local.txt`. Deleting the auth state
file removes accounts, identities, memberships, and sessions, but leaves
product data intact.

Bounded aggregate login cooldowns no longer require auth-state deletion for
recovery. Operators can clear throttle state through the authenticated
admin+CSRF route or the one-time recovery token.

Cats Mobile now keeps Google login separate from browser GIS. The mobile
client discovers public mobile Google client ids from `/api/mobile/auth/status`,
starts a mobile OIDC flow, posts the resulting ID token to
`/api/mobile/auth/google/login`, and receives a mobile bearer token only after
the server verifies the token against `CATS_AUTH_GOOGLE_MOBILE_AUDIENCES` and
the per-attempt nonce.

Downstream tooling may key on these pinned error codes: `E_UNAUTHENTICATED`
for `401`, `E_FORBIDDEN` for plain authorization failures, and
`E_CSRF_MISMATCH` for Cats synchronizer CSRF failures.

Deprecations:

None in this slice.

## 2026-04-30

### Chat routing after ADR-091

Behavior change:

Existing non-direct participant chats changed routing behavior: a no-mention
user turn now enters the orchestrator first instead of auto-dispatching to
`defaultRecipientId`. Direct/private lanes still route unmentioned turns to the
direct participant, and explicit `@mention` routing is unchanged.

Migration steps:

Operators with older local rooms should mention the intended participant or
choose a per-turn audience when they want a specific Cat to answer first.

Deprecations:

None.
