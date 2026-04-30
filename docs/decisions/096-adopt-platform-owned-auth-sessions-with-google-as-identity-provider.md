# ADR-096: Adopt Platform-Owned Auth Sessions with Google as an Identity Provider

## Status

Proposed (2026-04-30)

## Context

Cats Platform recently gained LAN-facing browser access for trusted local
networks. That solved same-network access from a phone, tablet, or second
browser, but it also made an older gap more visible: the platform has no
general inbound authentication. Any browser that can reach the host can call
the same product APIs as the owner, including setup/reset, Core writes,
runtime proxies, shell browse/open-folder helpers, transport settings, Work
runs, and Chat sends.

The first-run `/setup` flow currently treats "setup complete" as the only
entry gate. It records the owner display name and optional Guide Cat state, but
it does not create a login account, establish an authenticated browser session,
or distinguish a local admin from another human on the LAN.

Google Sign-In is attractive because it can bootstrap a real identity without
asking the owner to manage a local password. However, Google OAuth / Google
Identity Services is not a substitute for a Cats-owned authorization layer:

- the frontend can receive a Google ID token, but the backend must verify it
  before trusting the identity;
- Cats still needs its own session cookie and route gate after verification;
- Google Web OAuth origins generally require HTTPS and cannot use raw LAN IP
  hosts, with localhost as the practical development exception;
- Cats Work may later need multiple real humans in one digital company, which
  requires accounts, roles, memberships, and actor attribution instead of a
  single owner-profile field.

## Decision

Cats Platform will adopt a **platform-owned authentication and session layer**
at the platform host. Google is one supported identity provider for that
layer, not the layer itself.

### 1. Platform host owns the auth boundary

All browser-facing product and runtime-proxy APIs must pass through a shared
platform auth gate once setup is complete. The gate lives at the platform host,
before Chat / Work / Code / Core / runtime route dispatch.

The server session is a Cats-owned HttpOnly cookie with `SameSite=Lax` by
default and `Secure` when Cats is served over HTTPS. Authenticated mutating API
requests use Cats synchronizer CSRF tokens tied to the server session.
`/api/auth/status` is the canonical token source; app-shell/bootstrap payloads
may mirror that token but must not mint or rotate it independently. Tokens
rotate on login/session creation and privilege changes, and are invalidated on
logout/session revocation. Google Identity Services credential POST routes are
separate: they validate Google's `g_csrf_token` before a Cats session exists
and do not use the generic authenticated-API CSRF header.

The frontend may initiate login flows, but the frontend never decides that a
user is authenticated or authorized by itself.

### 2. First-run setup creates the first admin account

`/setup` remains the first-run route, but it becomes an admin bootstrap flow.
It may create the first admin by either:

- local credentials: display name, email/login handle, password; or
- Google identity: verified Google ID token, display name, email, picture, and
  stable Google `sub`.

Both paths result in the same Cats account/membership/session shape. The setup
flow still records owner profile and Guide Cat state, but owner profile is no
longer treated as the login account itself.

### 3. Accounts, identities, sessions, and memberships are separate

The auth model separates these concepts:

- **Account**: a real human who can log in to this Cats workspace.
- **Identity**: a credential/provider binding for an account, such as local
  password or Google `sub`.
- **Session**: a browser session established after successful login.
- **Membership**: roles granted inside the local Cats workspace, initially
  `owner` and `admin`, later `operator` / `member` as Cats Work needs them.
- **Actor mapping**: the account's platform identity can map to a Core actor
  for tasks, approvals, runs, and audit attribution. The first admin maps to
  `actor-owner`. Later accounts do not silently inherit that mapping:
  memberships created after the first admin default `coreActorId` to `null`,
  and write paths that require Core actor attribution must fail closed or
  require an explicit mapping instead of falling back to `actor-owner`.

This auth state is platform-owned local state. It should not be forced into
the existing owner profile or Chat state records just to avoid adding a new
domain seam.

### 4. Google is implemented as an identity provider

The Google provider must:

- be opt-in through configuration, e.g. `CATS_AUTH_GOOGLE_CLIENT_ID`;
- verify ID tokens server-side with a maintained verifier library rather than
  trusting frontend claims or calling Google's debug-only `tokeninfo` endpoint
  in production;
- validate signature, `aud`, `iss`, and `exp`;
- optionally enforce a configured Google Workspace hosted domain (`hd`);
- use Google `sub` as the stable identity key, not email.

For LAN raw-IP access, Google Sign-In may be unavailable because Google's Web
OAuth origin and redirect rules generally reject raw IP hosts and plain HTTP
except localhost. Cats must therefore keep local admin credentials as a
first-class bootstrap/login path.

### 5. Route access policy is explicit

Before setup is complete, only bootstrap-safe routes are public:

- static renderer assets;
- health/readiness routes that do not expose secrets;
- minimal app-shell/bootstrap envelope reads that disclose setup/auth status
  without product data;
- setup/bootstrap routes required to create the first admin;
- Google auth callback/token verification routes when the provider is enabled.

After setup is complete, unauthenticated requests may access only:

- static renderer assets;
- `/login` and auth status/login/logout routes;
- minimal app-shell/bootstrap envelope reads that let the renderer route to
  `/login` without leaking product data;
- narrow health routes intended for local process supervision.

All product data, setup reset, shell helper, runtime proxy, transport, Core,
Chat, Work, and Code mutation/read APIs require an authenticated session unless
a later ADR explicitly grants a different ingress model.

Once `setupCompleteAt` exists, the auth gate remains engaged even if auth state
is missing, unreadable, or corrupt. Such workspaces enter an admin-auth
bootstrap repair state; protected product APIs fail closed instead of becoming
public. This is a pre-release product, so the repair path can require the
local operator to create the first admin before continuing.

For this policy, corrupt auth state means JSON parse failure, missing required
top-level fields, or a schema version newer than the running code can read.
Unknown extra fields are not corrupt.

### 6. Multi-user support is future-proofed but not fully shipped in v1

The first implementation only needs one owner/admin account to close the LAN
security gap. The data model and API should still avoid single-user shortcuts
that would make future Cats Work multi-human sessions difficult.

In particular, API write attribution must receive a session principal and must
not collapse every authenticated admin to `actor-owner`. Existing single-owner
write paths may keep the first admin's explicit `actor-owner` mapping, but a
principal whose membership has `coreActorId: null` must be rejected by writes
that need Core actor attribution until an explicit mapping exists.

## Consequences

### Positive

- LAN access no longer means unauthenticated control of the local Cats
  workspace.
- Local admin credentials work in raw LAN-IP and offline scenarios where
  Google OAuth cannot.
- Google login can still offer a low-friction bootstrap/login path on
  localhost, HTTPS domains, or trusted tunnel origins that satisfy Google
  origin rules.
- Cats Work gets a clean runway for multiple human operators without
  conflating "owner profile" with "logged-in account".
- Runtime and shell helper routes stay behind the platform host boundary
  instead of needing their own independent auth models first.

### Negative

- Adds a platform-wide request gate, which can break existing tests and dev
  tools until they use authenticated test helpers.
- Adds sensitive local state: password hashes, session secrets, and identity
  bindings need careful storage and reset semantics.
- Google Sign-In creates configuration overhead: client ID, authorized
  origins/redirects, and HTTPS/tunnel setup for non-localhost browser access.
- Cookies, CSRF protection, and Vite dev proxy behavior must be tested
  carefully so dev and packaged flows behave the same.
- Login attempts need rate limiting and lockout behavior so LAN access does
  not become a brute-force surface for local admin credentials.

### Neutral

- This decision does not make direct public internet exposure safe by itself.
  LAN/tunnel access remains trusted-operator access unless later security work
  adds hardening for public deployment.
- Telegram webhook secret-token validation remains a separate ingress guard.
- `cats-runtime` remains behind `cats-platform`; the runtime does not become
  the public authentication authority.

## Alternatives Considered

### Alternative 1: Frontend-only Google Sign-In

- **Pros**: quick UI-only implementation; little server work.
- **Cons**: does not protect APIs, shell helpers, runtime proxy, or direct
  HTTP calls; frontend claims can be spoofed; no server session or audit
  principal exists.
- **Why rejected**: it does not solve the LAN access risk.

### Alternative 2: Google-only authentication

- **Pros**: avoids local password storage; familiar UX.
- **Cons**: raw LAN IP and offline use are poor fits for Google OAuth; users
  without a Google account cannot bootstrap; local-first desktop packaging
  becomes dependent on external identity availability.
- **Why rejected**: Cats needs a local-first admin path.

### Alternative 3: Single shared admin password only

- **Pros**: fastest way to gate LAN access; no OAuth configuration.
- **Cons**: no per-human attribution, no future multi-user role model, no
  provider identity linking, poor UX for a future team workspace.
- **Why rejected**: it solves the immediate gate but fights the Cats Work
  direction.

### Alternative 4: Put auth in `cats-runtime`

- **Pros**: could protect runtime routes directly.
- **Cons**: browser ingress is intentionally owned by `cats-platform`; runtime
  auth would not naturally cover product routes, setup, Chat/Work/Core data,
  or shell helpers.
- **Why rejected**: auth belongs at the product host boundary that owns the
  browser surface.

## References

- [SPEC-100: Platform Authentication, Admin Bootstrap, and Google Identity](../specs/SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)
- [PLAN-089: Platform Authentication and Google Identity Rollout](../plans/PLAN-089-platform-authentication-and-google-identity-rollout.md)
- [ADR-074: Keep browser ingress at the platform host and phase LAN before tunnels](./074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md)
- [SPEC-075: Platform Browser Ingress for LAN and Tunneled Access](../specs/SPEC-075-platform-browser-ingress-for-lan-and-tunneled-access.md)
- Google Identity Services — verify Google ID token on server side: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Google backend authentication guidance: https://developers.google.com/identity/sign-in/web/backend-auth
- Google OAuth client origin and redirect rules: https://support.google.com/cloud/answer/15549257

---

*Decision made: 2026-04-30*
*Decision makers: user + Codex*
