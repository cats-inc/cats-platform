# SPEC-100: Platform Authentication, Admin Bootstrap, and Google Identity

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

Cats Platform needs a real authentication boundary before LAN-facing access can
be treated as more than a trusted developer convenience. This spec defines the
first platform-owned auth layer: `/setup` creates the first admin account,
`/login` establishes a Cats session, protected API routes require that session,
and Google Sign-In is supported as an optional identity provider rather than as
the whole authorization system.

## Goals

- Protect Cats Platform APIs after setup completion with server-side sessions.
- Preserve local-first operation through local admin credentials.
- Allow `/setup` and `/login` to use Google identity when configured and when
  the current origin satisfies Google OAuth rules.
- Separate accounts, provider identities, sessions, memberships, and Core actor
  attribution so future Cats Work multi-human workflows have a clean model.
- Keep the first rollout small enough to close the LAN access risk without
  building a full enterprise IAM system.

## Non-Goals

- Public-internet hardening for arbitrary untrusted exposure.
- Enterprise SSO beyond Google OIDC / Google Identity Services.
- Passkeys, WebAuthn, TOTP, recovery codes, or MFA in the first slice.
- Organization/team administration UI beyond the first admin and basic session
  status.
- Per-resource ACLs for every Chat / Work / Code object.
- Replacing Telegram webhook secret-token validation.
- Moving browser auth down into `cats-runtime`.
- Solving Google OAuth for raw LAN IP origins. The local admin path covers that
  environment.

## User Stories

- As the owner, I want `/setup` to create an admin login so that opening Cats on
  the LAN does not expose my workspace to anyone on the same network.
- As the owner, I want Google login when available so that I do not have to
  manage another password on localhost or a trusted HTTPS tunnel.
- As the owner, I want a local password fallback so that Cats still works on
  raw LAN IP, offline, and packaged desktop environments.
- As a future Cats Work operator, I want my own session and role so that tasks,
  approvals, and runs can be attributed to the correct human.

## Requirements

### Functional Requirements

#### Auth state

1. The platform shall persist auth state separately from Chat transcript state
   and owner profile state.
2. Auth state shall include accounts, provider identities, sessions, and
   workspace memberships.
3. The first account created by setup shall receive `owner` and `admin`
   membership roles.
4. Only the first admin account shall map to the existing owner actor
   (`actor-owner`) for initial Core attribution. Later memberships shall
   default `coreActorId` to `null`.
5. Write paths that require Core actor attribution shall fail closed when the
   current principal's membership has `coreActorId: null`, unless that path
   explicitly supports an unaffiliated account action. Unaffiliated account
   actions are limited to account/session self-management, such as self-profile
   reads, session status, logout, password change, and revoking the current
   account's sessions. Such paths shall never fall back to `actor-owner`.
6. Auth state shall include a version field for future schema changes.
7. Password identities shall store only salted password hashes, never plaintext
   or reversible passwords.
8. Session records shall store only server-generated opaque token hashes, never
   raw session tokens.
9. Google identities shall store Google `sub` as the stable external subject.
   Email may be stored for display or lookup hints but shall not be the primary
   identity key.

#### Setup and bootstrap

10. Before setup is complete, `/setup` shall offer a local admin path.
11. Before setup is complete, `/setup` may offer a Google admin path only when
    Google auth is configured.
12. Completing setup through either path shall create the first admin account,
    create a membership, update owner profile display fields, optionally create
    Guide Cat state, mark setup complete, and establish a session.
13. If setup is already complete, setup-complete endpoints shall reject repeat
    bootstrap attempts.
14. Setup reset shall require an authenticated admin session after setup has
    been completed.
15. A development/test-only reset helper may bypass auth only in isolated test
    dependencies, not in the real dev server.
16. If existing state has `setupCompleteAt`, missing, unreadable, or corrupt
    auth state shall enter an admin-auth bootstrap repair flow before exposing
    protected product APIs. The route gate remains active and protected routes
    fail closed during repair. Corrupt auth state means JSON parse failure,
    missing required top-level fields, or a schema version greater than the
    current code can read. Unknown extra fields shall not be treated as
    corrupt.

#### Login, logout, and session status

17. The platform shall expose a session status endpoint returning whether the
    current request is authenticated and, if so, the current principal summary.
18. The platform shall expose a local login endpoint accepting account
    identifier and password.
19. The platform shall expose a Google login/token endpoint accepting a Google
    credential/ID token and returning a Cats session only after server-side
    verification.
20. Logout shall revoke the current session server-side and clear the browser
    cookie.
21. Sessions shall have an expiration timestamp.
22. Session cookies shall be HttpOnly and `SameSite=Lax` by default.
23. Session cookies shall use Secure when Cats is served over HTTPS.
24. The platform shall support a session secret loaded from configuration or
    generated/persisted locally on first run.
25. Failed local and Google login attempts shall be throttled per remote
    address and account/provider key. The default policy shall lock the target
    for at least 30 seconds after 5 failed attempts and shall log lockouts
    without leaking credential details.

#### Route gate

26. Once setup is complete, protected routes shall require an authenticated
    session before product-specific route dispatch.
27. Protected routes include Chat, Work, Code, Core, setup reset, runtime proxy,
    runtime-hosted setup/operator surfaces, shell browse/open-folder helpers,
    transport configuration, provider mutation routes, and subscription routes.
28. Public routes after setup shall be limited to renderer assets, login/auth
    endpoints, and narrow health/readiness endpoints.
29. Before setup is complete, public routes shall be limited to renderer
    assets, minimal app-shell/bootstrap envelope reads, setup/bootstrap
    endpoints, auth bootstrap/status endpoints, optional Google auth bootstrap
    endpoints, and narrow health/readiness endpoints.
30. Unauthenticated app-shell/bootstrap reads shall return only setup/auth
    routing state and provider availability, including
    `auth.providers.google = { enabled, clientId }`. They shall not include
    product data such as cats, channels, Work state, Core records, runtime
    session details, transport bindings, or shell helper data.
31. Unauthenticated browser navigation to product routes shall render the app
    shell and let the renderer redirect to `/login`.
32. Unauthenticated API requests shall return `401` with a structured error.
33. Authenticated but unauthorized requests shall return `403` with a
    structured error.

#### Authorization and roles

34. The first rollout shall support `owner` and `admin` roles.
35. Admin role shall authorize setup reset, account management bootstrap
    follow-ups, and platform settings that mutate auth-sensitive state.
36. Authenticated owner/admin sessions shall authorize the current single-user
    product APIs in the first rollout.
37. The auth principal shall be available to route handlers so future writes can
    attribute actions to the correct account and Core actor.
38. The first rollout may keep the first admin's explicit `actor-owner` mapping
    for existing single-owner writes. Other owner/admin accounts shall not be
    silently mapped to `actor-owner`; writes that need Core actor attribution
    shall fail closed until an explicit `coreActorId` mapping exists.
    The `coreActorId: null` guard is a forward-looking invariant: v1 ships only
    the first-admin UI path, but the guard prevents future account-management
    work from silently regressing multi-user attribution.

#### Google identity provider

39. Google Sign-In shall be disabled unless `CATS_AUTH_GOOGLE_CLIENT_ID` is
    configured.
40. The server shall verify Google ID tokens using a maintained verifier
    library. It shall not trust frontend-decoded claims.
41. Verification shall check token signature, `aud`, `iss`, and `exp`.
42. If `CATS_AUTH_GOOGLE_HD` is configured, verification shall also require the
    `hd` claim to match one of the configured domains.
43. The server shall reject Google tokens whose email is not verified when the
    provider flow depends on email display or matching.
44. The renderer shall hide or disable Google login affordances when the
    minimal app-shell/auth bootstrap envelope reports the provider is
    unavailable or lacks a client ID.
45. The renderer shall surface a clear fallback to local login on raw LAN IP or
    other origins where Google Web OAuth is not expected to work.

#### CSRF and browser safety

46. The Google credential POST flow shall validate the Google Identity Services
    `g_csrf_token` double-submit contract when GIS submits a credential.
47. For authenticated Cats sessions, the server shall issue a synchronizer CSRF
    token through `/api/auth/status`. App-shell or auth bootstrap payloads may
    mirror the current status token for render efficiency, but they shall not
    mint, rotate, or diverge from the `/api/auth/status` token.
48. Mutating authenticated API requests shall send that token in
    `X-Cats-CSRF-Token`; the server shall validate it against the current
    session before route dispatch.
49. Google credential POST routes shall not require `X-Cats-CSRF-Token` before a
    Cats session exists, because their CSRF boundary is the GIS
    `g_csrf_token`.
50. CSRF tokens shall rotate on login/session creation and on privilege
    changes. Logout and session revocation shall invalidate existing CSRF
    tokens for the revoked session.
51. Auth error responses shall not leak password-hash, session-token,
    configured secret, or Google token details.
52. Login attempts shall use generic invalid-credential errors.

#### Configuration

53. The platform shall add documented auth configuration keys:
    - `CATS_AUTH_ENABLED`
    - `CATS_AUTH_SESSION_SECRET`
    - `CATS_AUTH_SESSION_TTL_MS`
    - `CATS_AUTH_LOGIN_FAILURE_LIMIT`
    - `CATS_AUTH_LOGIN_LOCKOUT_MS`
    - `CATS_AUTH_GOOGLE_CLIENT_ID`
    - `CATS_AUTH_GOOGLE_HD`
54. Auth shall default to enabled when the platform is bound to a non-loopback
    host or when `setupCompleteAt` exists. Once `setupCompleteAt` exists,
    missing, unreadable, or corrupt auth state shall trigger the repair flow
    and fail closed; it shall never disable the route gate.
55. During development, a temporary explicit opt-out may exist only if it is
    documented as unsafe, applies only to loopback setup-incomplete workspaces,
    and does not apply to packaged or LAN-facing defaults.

Effective auth gate state:

| Host / build state | Setup state | `CATS_AUTH_ENABLED` | Effective gate |
|--------------------|-------------|---------------------|----------------|
| Non-loopback or packaged | Any | unset or `true` | Enabled |
| Non-loopback or packaged | Any | `false` | Configuration error; refuse to start serving browser traffic |
| Loopback dev/test | Setup incomplete | unset | Disabled except setup/bootstrap policy |
| Loopback dev/test | Setup incomplete | `true` | Enabled |
| Loopback dev/test | Setup incomplete | `false` | Disabled, unsafe dev/test only |
| Loopback dev/test | `setupCompleteAt` exists | unset or `true` | Enabled |
| Loopback dev/test | `setupCompleteAt` exists | `false` | Enabled; `setupCompleteAt` takes precedence and the override is ignored with a warning |

### Non-Functional Requirements

- **Security**: Authentication decisions must be made on the server, not in the
  renderer. Failed-login throttling and lockout are required before LAN-facing
  auth is considered complete.
- **Local-first operation**: Local password bootstrap/login must work without
  Google, HTTPS, internet access, or a public DNS name.
- **Privacy**: Auth state must not store Google access tokens unless a later
  spec explicitly needs Google API access. ID tokens are consumed transiently.
- **Operability**: Login and setup failures should be structured enough for UI
  recovery without exposing sensitive detail.
- **Testability**: Route tests must be able to create authenticated principals
  in isolated in-memory stores without writing to the user's real dev state.
- **Compatibility posture**: This pre-release product should remove
  unauthenticated legacy paths instead of preserving bypass shims.

## Design Overview

```
Browser / renderer
  |
  | local credentials OR Google ID token
  v
cats-platform auth routes
  |
  | verifies credential, creates Cats session cookie
  v
platform auth gate
  |
  | session principal
  v
Chat / Work / Code / Core / runtime proxy routes
```

Auth state shape:

```ts
interface PlatformAuthState {
  version: 1;
  updatedAt: string;
  accounts: PlatformAccountRecord[];
  identities: PlatformIdentityRecord[];
  sessions: PlatformSessionRecord[];
  memberships: PlatformMembershipRecord[];
}

interface PlatformAccountRecord {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

interface PlatformIdentityRecord {
  id: string;
  accountId: string;
  provider: 'local_password' | 'google';
  providerSubject: string;
  email: string | null;
  passwordHash?: string;
  passwordHashAlgorithm?: string;
  createdAt: string;
  updatedAt: string;
}

interface PlatformSessionRecord {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
}

interface PlatformMembershipRecord {
  id: string;
  accountId: string;
  roles: Array<'owner' | 'admin' | 'operator' | 'member'>;
  coreActorId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Public/protected route policy:

| Phase | Public | Protected |
|-------|--------|-----------|
| Before setup | static assets, health, minimal app-shell/bootstrap envelope, setup bootstrap, auth status, optional Google auth bootstrap | product data, runtime proxy, shell helpers, transports |
| After setup | static assets, health, minimal app-shell/bootstrap envelope, login, auth status/logout | all product/runtime/shell/transport/Core APIs |

## Dependencies

- Platform server request router and route contexts
- Existing setup wizard and platform setup routes
- Existing AppShell / PlatformHostEnvelope bootstrap flow
- File-backed platform state path helpers
- Google Identity Services frontend library
- Maintained ID-token verifier library for Node.js
- ADR-074 / SPEC-075 LAN ingress constraints

## Open Questions

- [ ] Exact verifier dependency: Google Auth Library for Node.js vs a smaller
      standards-based JWT/OIDC verifier such as `jose`.
- [ ] Whether account management UI belongs in the first rollout or a follow-up
      after the first admin gate lands.
- [ ] Whether future role names should stay coarse (`admin`, `operator`) or
      align directly with Cats Work responsibilities.

## References

- [ADR-096: Adopt Platform-Owned Auth Sessions with Google as an Identity Provider](../decisions/096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
- [PLAN-089: Platform Authentication and Google Identity Rollout](../plans/PLAN-089-platform-authentication-and-google-identity-rollout.md)
- [ADR-074: Keep browser ingress at the platform host and phase LAN before tunnels](../decisions/074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md)
- Google Identity Services — verify Google ID token on server side: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Google backend authentication guidance: https://developers.google.com/identity/sign-in/web/backend-auth
- Google OAuth client origin and redirect rules: https://support.google.com/cloud/answer/15549257

---

*Created: 2026-04-30*
*Author: Codex*
*Related Plan: [PLAN-089](../plans/PLAN-089-platform-authentication-and-google-identity-rollout.md)*
