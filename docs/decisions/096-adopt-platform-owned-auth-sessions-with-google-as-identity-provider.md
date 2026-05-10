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
may mirror that token but must not mint or rotate it independently.
Unauthenticated `/api/auth/status` and bootstrap envelope responses do not
return a CSRF token — the field is absent or `null`. Tokens rotate on
login/session creation, are invalidated on logout/session revocation, and have
a forward-looking rotation hook for privilege changes that is dormant in v1
(no role mutation paths exist yet). Google Identity Services credential POST
routes are separate: they validate Google's `g_csrf_token` before a Cats
session exists and do not use the generic authenticated-API CSRF header.

CSRF mismatches return `403` with `code: 'E_CSRF_MISMATCH'` in the structured
error body; the renderer retries exactly that code by refreshing
`/api/auth/status` and re-issuing the mutation once. A second consecutive
`E_CSRF_MISMATCH` is a hard error. The renderer does not pattern-match on
user-visible text or retry on plain `E_FORBIDDEN`.

Pre-auth mutating endpoints — local first-admin setup, `/api/auth/login`, and
the auth-state-file repair first-admin creation — have no Cats session yet to
mint a CSRF token from, so they are protected by an allowed-browser-origin
gate using the `Origin` and `Sec-Fetch-Site` headers. The allowlist includes
the platform browser origins and explicitly configured dev/proxy origins such
as Vite. `Sec-Fetch-Site: same-site` is never enough by itself; API mutations
also need an allowlisted `Origin`. Cross-site POSTs against `/setup` or
`/api/auth/login` from a malicious LAN page are rejected before any account or
session is created. Authenticated mutations pass both the allowed-origin gate
and the synchronizer CSRF token.

Per-account brute force is contained by mandatory aggregate guards on top of
the composite `(account, address)` lockout: a per-account progressive delay
that grows with recent failure count, a per-account 24-hour failure budget
that triggers an alert and bounded cooldown, and a per-/24 subnet failure
budget so a single subnet cannot quietly drive a wide brute force across many
accounts. The aggregate cooldown has a TTL and non-destructive recovery paths;
the single v1 owner should not have to delete auth state after legitimate
mistakes.

The frontend may initiate login flows, but the frontend never decides that a
user is authenticated or authorized by itself.

### 1a. Expo Go and mobile clients are not browser sessions

ADR-095's Expo Go QR flow loads a Cats Mobile bundle from the desktop over
LAN. That QR flow is a bundle/bootstrap mechanism, not authentication. It
must not create an account, grant a session, or authorize product data access.

Cats Mobile is a first-party client of the same platform host, but it is not a
browser-origin client. It cannot rely on the browser assumptions in section 1:
HttpOnly cookies, `SameSite`, `Origin`, `Sec-Fetch-Site`, or the Cats
synchronizer CSRF header are browser protections, not the mobile session
contract.

Mobile data access therefore uses a Cats-owned **mobile device session**:

- local credentials and Google identity still authenticate against the same
  account/identity/membership model;
- the server issues an opaque mobile bearer token, stores only its hash, and
  accepts it through `Authorization: Bearer ...`;
- the mobile app stores the raw token in Expo SecureStore or the equivalent
  secure OS credential store when available, never in plain AsyncStorage;
- device sessions have expiration, revocation, and last-seen metadata, and
  route handlers receive the same principal shape as browser sessions.

Mobile bearer requests do not use browser CSRF because the credential is not
an ambient browser cookie. The platform auth gate accepts either a valid
browser cookie session that satisfies browser CSRF/origin policy or a valid
mobile device bearer session. The QR/manifest/bundle routes remain limited to
static bootstrap artifacts and must never embed product data, session tokens,
Google tokens, or other secrets.

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

Mobile Google login is a separate provider surface from browser Google
Identity Services. Expo Go / React Native flows use AuthSession, a native
Google library, or another mobile OAuth/OIDC redirect flow. They do not submit
the browser GIS `g_csrf_token` credential POST. The Cats server still verifies
the resulting ID token or authorization-code exchange server-side and binds
the verified Google `sub` to the same account model.

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
this ADR or a later ADR explicitly grants a different ingress model. Browser
requests satisfy that rule with a browser session cookie plus the browser
CSRF/origin policy. Cats Mobile requests satisfy it with a mobile device bearer
session. Expo Go manifest/bundle/bootstrap routes are not product-data routes
and do not satisfy this requirement by themselves.

Once `setupCompleteAt` exists, the auth gate remains engaged even if auth state
is missing, unreadable, or corrupt. Such workspaces enter an admin-auth
bootstrap repair state; protected product APIs fail closed instead of becoming
public. This is a pre-release product, so the repair path can require the
local operator to create the first admin before continuing.

For this policy, corrupt auth state means JSON parse failure, missing required
top-level fields, or a schema version newer than the running code can read.
Unknown extra fields are not corrupt.

Once `setupCompleteAt` exists, `CATS_AUTH_ENABLED=false` is rejected as a
configuration error on every host, including loopback. Honoring or silently
ignoring the override after setup would make "loopback warns but works" a path
that becomes "non-loopback refuses to start" after deployment. The rule is
uniform across hosts so that post-setup operators cannot accidentally weaken
the gate via environment configuration.

v1 ships no in-band password-reset, recovery-code, or self-service unlock flow.
To prevent operators from being permanently locked out of their own workspace
after losing the only admin credential, deleting the platform auth state file
(e.g. `<state-dir>/auth-state.local.json`) triggers the repair flow on next
start. The escape hatch is documented in `docs/setup-guide.md`,
`docs/deployment.md`, and the rollout release notes; it discards all existing
sessions, identities, and memberships but leaves owner profile, Guide Cat
state, and product data (Chat, Work, Code, Core) untouched.

Repair first-admin creation is **not** a publicly-reachable mutation on a
LAN-bound deployment. Without this constraint, deleting the auth state file on
a LAN-facing host would let any same-network client race to become the new
admin. The repair endpoint accepts a request only when it carries a one-time
recovery token that the platform generates and writes to a restrictive
state-directory file at repair-mode start-up. Loopback source address is not
authorization, because reverse proxies and tunnels can make remote clients
appear local. Structured logs contain only the recovery mode event and token
file path, never the raw token; an interactive local console may print the raw
token only when it is not routed into structured or remote logging. The token
is single-use, rotates on every repair-mode start-up, and is invalidated when
the first admin is re-created or the platform restarts. The deployment docs
warn operators to keep the recovery token local before exposing the host on
the LAN during recovery.

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
- Mobile device sessions add another credential class that needs secure
  storage, revocation, and clear tests so Expo Go QR pairing is not mistaken
  for authorization.

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
- [ADR-095: Distribute Cats Mobile as a Static Expo Go Bundle Served by the Desktop](./095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- [SPEC-099: Mobile pairing manifest server in Cats Desktop](../specs/SPEC-099-mobile-pairing-manifest-server.md)
- [ADR-074: Keep browser ingress at the platform host and phase LAN before tunnels](./074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md)
- [SPEC-075: Platform Browser Ingress for LAN and Tunneled Access](../specs/SPEC-075-platform-browser-ingress-for-lan-and-tunneled-access.md)
- Google Identity Services — verify Google ID token on server side: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Google backend authentication guidance: https://developers.google.com/identity/sign-in/web/backend-auth
- Google OAuth client origin and redirect rules: https://support.google.com/cloud/answer/15549257
- Expo AuthSession: https://docs.expo.dev/versions/latest/sdk/auth-session/
- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- Expo Go vs development builds: https://docs.expo.dev/get-started/set-up-your-environment/

---

*Decision made: 2026-04-30*
*Amended: 2026-04-30 — composite `(account, address)` throttle key; uniform `CATS_AUTH_ENABLED=false` rejection after `setupCompleteAt`; pre-auth CSRF token explicitly absent; renderer stale-CSRF retry contract; rotation on privilege changes marked forward-looking; auth-state-file escape hatch for forgotten credentials documented.*
*Amended: 2026-04-30 — closed pre-auth bootstrap CSRF gap with same-origin gate on `/setup`/`/api/auth/login`/repair; constrained repair first-admin creation to a one-time recovery token so the escape hatch does not re-open LAN admin bootstrap through reverse proxies or tunnels; pinned `E_CSRF_MISMATCH` error code so renderer retry cannot collide with `E_FORBIDDEN`; promoted per-account aggregate guards (progressive delay, daily failure budget, per-/24 subnet budget) from optional to required.*
*Amended: 2026-04-30 — aligned the pre-auth gate with Vite/reverse-proxy topologies by using an explicit allowed browser-origin set; clarified that `same-site` does not pass without an allowlisted `Origin`; kept raw recovery tokens out of structured logs; made aggregate account cooldown bounded and recoverable without deleting auth state.*
*Amended: 2026-04-30 — added Expo Go / Cats Mobile as a first-party non-browser client: QR pairing only bootstraps the bundle, product data requires a mobile device bearer session, and mobile Google login is separate from browser GIS credential POST.*
*Decision makers: user + Codex*
