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

## 2026-05-10

### Platform auth rollout in progress

Behavior change:

PLAN-089 server-side auth foundations are landing behind the not-yet-installed
global route gate. Browser local login/logout/status and Cats Mobile bearer
login/logout/status routes now exist, and setup-complete missing/corrupt auth
state now enters a constrained repair path through
`POST /api/auth/repair/first-admin`. Product APIs are not fully protected until
the dedicated gate slice lands, so do not treat LAN exposure as closed yet.

Migration steps:

Set `CATS_AUTH_SESSION_SECRET` before testing first-admin local login or mobile
bearer sessions. Keep `CATS_AUTH_ALLOWED_BROWSER_ORIGINS` explicit for every
trusted browser origin that may submit setup/login/repair/Google credential
POST requests.

Do not rely on `CATS_AUTH_ENABLED=false`; it is an unsafe dev/test escape hatch
and is rejected after `setupCompleteAt` exists. When an operator forgets the
only admin credential, delete only
`<platform-state-dir>/auth-state.local.json`, restart, and complete repair from
loopback or with the one-time token written to
`<platform-state-dir>/auth-recovery-token.local.txt`. Deleting the auth state
file removes accounts, identities, memberships, and sessions, but leaves
product data intact.

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
