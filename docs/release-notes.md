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

## 2026-09-02

### First Admin is always local, and Google is linked from Settings

Behavior change:

Setup now requires an Admin identifier and password. `/api/platform/setup/complete`
rejects a missing or partial pair with `400 invalid_admin_credentials` before it
writes any owner, Guide Cat, setup, or auth state, so a workspace can no longer
reach `setupCompleteAt` without a local Admin. During the promotion period an
Admin password must contain 8 to 256 Unicode code points; Cats applies no
uppercase/lowercase/digit/symbol rule and accepts spaces and password-manager
output. Length is counted in code points, so an emoji counts once.

First-admin creation is serialized and rechecks "no Admin exists" inside the
same auth-state write. Two concurrent submissions now produce exactly one
Admin; the loser receives `409 already_complete` and creates nothing. Auth
state is written before the chat/core snapshot and rolled back if that snapshot
fails.

`Settings > General > Account` now reports real login-method state and owns the
Google lifecycle. Linking or unlinking Google requires re-entering the local
password: the server issues a single-use action grant, valid for five minutes
and bound to the account, browser session, and purpose, which the browser sends
in `X-Cats-Auth-Action`. A stolen session and CSRF token are no longer enough
to attach a Google identity. A verified Google email must match the account
email; an account created with a non-email handle adopts the verified address
on its first successful link. Unlinking refuses to leave the account without a
local password, and on success revokes every other browser and mobile session
for that account while keeping the device that performed it signed in.

Ordinary Google login is unchanged in intent and stricter in practice: it
resolves only an already-linked Google `sub` and no longer rewrites the Cats
account email from the provider.

Deprecations:

`POST /api/auth/google/setup` — the standalone Google-only first-admin route —
is removed along with its renderer wrapper, domain helper, and public-route
exception. It had no supported setup UX. `/api/auth/google/link` and the new
`/api/auth/google/unlink` are protected routes now, not pre-auth ones.

Migration steps:

None for existing workspaces: an already-created Admin keeps working, and a
linked Google identity is unaffected. Operators automating first-run setup must
add `adminIdentifier` and `adminPassword` to their
`/api/platform/setup/complete` request body.

## 2026-08-05

### Desktop runtime setup opens in an authenticated system browser

Behavior change:

Desktop links to Cats Runtime setup, dashboard, and playground surfaces once
again open in the user's system browser instead of replacing the current
Electron page. Before opening the browser, the authenticated Desktop renderer
requests a 30-second, single-use handoff. The platform stores only its hash,
consumes it before issuing a separate HttpOnly browser session cookie, and
redirects to the allow-listed Runtime surface. Replays, expired handoffs,
non-Runtime return paths, and open redirects are rejected. The final Runtime
URL contains no handoff credential.

Migration steps:

None. The system browser receives its own Cats session the first time a
Desktop Runtime link is opened.

Deprecations:

None.

## 2026-08-04

### Every platform entrypoint provisions its first-run auth secret

Behavior change:

Clean `cats-platform`, `cats-one`, local dev, and packaged Desktop starts no
longer require an operator-created `.env` before the first-admin setup form can
complete. When no explicit `CATS_AUTH_SESSION_SECRET` is configured, the
platform server generates a 256-bit secret, persists it in the user-local
platform config directory, and reuses it across launches. Persistence uses an
atomic no-clobber publish so concurrent hosts converge on one value;
filesystems without hard-link support use an exclusive-copy fallback, while
permission errors remain fail-closed. Invalid files are quarantined and
regenerated, and stale temporary/invalid artifacts are cleaned during
provisioning. Direct CLI users receive an actionable path on stderr; Desktop
captures the same sidecar diagnostics and keeps real I/O failures on the
retryable bootstrap page. First-admin configuration failures use a safe
`503 configuration_error`, and unexpected pre-auth setup failures no longer
return raw exception messages, including failures caught by the server-level
request handler. Platform-launched project processes and shell helpers strip the
auth secret, runtime API key, Telegram credentials, and ngrok auth tokens from
their environments. The Windows installer smoke check honors custom
Desktop/platform data roots.

Migration steps:

None. Existing explicit secrets remain authoritative and are not overwritten.
Clustered or ephemeral deployments should configure their own shared
`CATS_AUTH_SESSION_SECRET`; single-host installs can keep the generated value.

Deprecations:

None.

### Desktop runtime setup links retain the authenticated app session

Behavior change:

Desktop links that open same-origin Cats surfaces in a new window, including
`/runtime/setup`, now navigate inside the authenticated Electron window. They
no longer open the system browser without the Desktop session cookie and fail
with `E_UNAUTHENTICATED`. Different-origin HTTP(S) links continue to use the
system browser, and unsupported URL schemes remain blocked.

Migration steps:

None.

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
