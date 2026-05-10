# PLAN-089: Platform Authentication and Google Identity Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-100: Platform Authentication, Admin Bootstrap, and Google Identity](../specs/SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)

Related decision:
[ADR-096: Adopt Platform-Owned Auth Sessions with Google as an Identity Provider](../decisions/096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)

## Overview

Roll out authentication in slices that close the LAN exposure risk first and
then add Google identity as a provider. The critical path is:

```
auth state + route gate
  -> local admin setup/login
  -> renderer login/setup integration
  -> Google provider
  -> Expo Go / Cats Mobile device sessions
  -> attribution and multi-user follow-through
```

The first working milestone is local admin auth. Google should not block the
server-side route gate because Google Web OAuth has origin restrictions that
make raw LAN-IP access unreliable.

The Expo Go QR path from ADR-095 is not part of the browser auth flow. It
loads the mobile bundle only. Mobile product-data access lands as a separate
first-party client slice using Cats-owned mobile device bearer sessions.

## Implementation Phases

### Phase 1: Auth Domain and Configuration

- [x] Task 1.1: Add platform auth types for accounts, identities, sessions,
      memberships, and principals.
- [x] Task 1.2: Add an auth state store beside existing platform state paths,
      with memory-store test support and file-store production support.
- [x] Task 1.3: Add auth config parsing for session secret, session TTL,
      Google client ID, Google hosted-domain allowlist, and explicit dev/test
      auth mode.
- [x] Task 1.4: Add password hashing helpers using Node crypto or an approved
      dependency, with algorithm/version metadata in stored password identities.
- [x] Task 1.5: Add session token generation, token hashing, expiration, and
      revocation helpers.

**Deliverables**: auth state can be read/written in isolated tests; local
password hashes and session tokens are never stored in plaintext.

### Phase 2: Server Auth Gate and Local Admin Bootstrap

Tasks 2.1 through 2.15 must land atomically in one PR or behind one feature
flag before the auth gate is enabled for any non-test host. Do not ship
middleware without login/status endpoints, first-admin setup, repair flow,
allowlists, CSRF issuance/validation, setup-reset protection, structured
errors, login throttling, aggregate brute-force guards, the pre-auth
allowed-browser-origin gate, Vite/reverse-proxy origin preservation, the
loopback/recovery-token-constrained repair endpoint, pinned error codes, and
the minimal unauthenticated envelope; do not ship
login endpoints as the only auth change while protected routes remain public.
The loopback/recovery-token constraint on repair (Task 2.13) is part of the
atomic group because shipping the auth-state-file escape hatch without it
re-opens LAN admin bootstrap.

- [x] Task 2.1: Add a platform auth route module:
      `/api/auth/status`, `/api/auth/login`, `/api/auth/logout`, and local
      bootstrap/login helpers. `/api/auth/status` is the canonical source for
      the Cats synchronizer CSRF token for authenticated sessions; app-shell or
      bootstrap payloads may only mirror that token.
- [ ] Task 2.2: Implement synchronizer CSRF validation for mutating
      authenticated API routes using `X-Cats-CSRF-Token`.
- [x] Task 2.3: Extend setup completion so the local credentials path creates
      the first admin account, identity, membership, owner profile update, and
      session in one logical transaction.
- [ ] Task 2.4: Add the repair flow for existing setup-complete workspaces that
      have missing, unreadable, or corrupt auth state. The route gate must stay
      engaged and protected product APIs must fail closed during repair.
      Corrupt means JSON parse failure, missing required top-level fields, or a
      schema version newer than this code can read; unknown extra fields are
      allowed.
- [ ] Task 2.5: Add platform request middleware before product route dispatch.
- [ ] Task 2.6: Implement public-route allowlists for pre-setup and post-setup
      states.
- [ ] Task 2.7: Return only a minimal setup/auth bootstrap envelope from
      unauthenticated app-shell reads, including
      `auth.providers.google = { enabled, clientId }`.
- [x] Task 2.8: Require admin auth for setup reset after setup is complete.
- [ ] Task 2.9: Add structured `401 unauthenticated` and `403 forbidden`
      responses.
- [x] Task 2.10: Add failed-login throttling and lockout for local and Google
      auth attempts. The lockout key shall be the composite
      `(account_or_provider_subject, remote_address)`, defaulting to 5
      failures followed by at least 30 seconds of lockout with secret-free
      logging. Per-account-only and per-IP-only hard lockout shall not be the
      primary throttle so a remote attacker cannot DoS a legitimate admin from
      arbitrary addresses.
- [ ] Task 2.11: Add mandatory aggregate brute-force guards on top of 2.10:
      (a) per-account progressive server-side delay that grows with recent
      failure count and resets on success; (b) per-account 24-hour failure
      budget that triggers a logged alert and bounded extended cooldown;
      (c) per-/24 IPv4 (or /64 IPv6) subnet failure budget. The account
      cooldown shall expire after a configured TTL and shall also be clearable
      by authenticated admin action, loopback-local recovery, or the recovery
      token flow without requiring auth-state deletion. Operators may tune
      thresholds via `CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP` /
      `CATS_AUTH_ACCOUNT_COOLDOWN_MS` /
      `CATS_AUTH_SUBNET_DAILY_FAILURE_CAP` but shall not be able to disable
      the guards entirely.
- [ ] Task 2.12: Add an allowed-browser-origin gate to all pre-auth mutating endpoints
      (`/setup` first-admin creation, `/api/auth/login`, repair first-admin
      creation, Google credential POST). The gate shall reject requests when
      `Origin` is absent or not in the configured allowed browser-origin set,
      `Sec-Fetch-Site` is `cross-site`, `Sec-Fetch-Site` is `same-site`
      without an allowlisted `Origin`, or `Sec-Fetch-Site` is `none` on an API
      mutation. This is in addition to (not a replacement for) the authenticated
      synchronizer CSRF token and the GIS `g_csrf_token` double-submit.
- [ ] Task 2.13: Constrain the auth-state-file repair first-admin creation
      endpoint so it is reachable only from loopback (`127.0.0.1` / `::1`)
      OR with a one-time recovery token. At repair-mode start-up the
      platform shall generate the token, write its hash to memory, and write
      the raw token only to `<state-dir>/auth-recovery-token.local.txt` with
      restrictive filesystem permissions where the OS supports them. Structured
      logs shall include only repair-mode status and the token file path, never
      the raw token. An interactive local console may print the raw token only
      when it is not routed into structured/remote logging. The token shall be
      single-use, rotate on every repair-mode start-up, and be invalidated after
      first-admin re-creation or platform restart.
- [ ] Task 2.14: Pin error response codes for the auth/CSRF gate. Use stable
      structured `code` fields: `E_UNAUTHENTICATED` for `401`, `E_FORBIDDEN`
      for plain authorization failures, and `E_CSRF_MISMATCH` for CSRF
      failures. The renderer logic shall key on these codes, never on
      user-visible text.
- [ ] Task 2.15: Wire browser-origin preservation for dev and deployed
      topologies before enabling the pre-auth gate. Add
      `CATS_AUTH_ALLOWED_BROWSER_ORIGINS`, include Vite dev origin(s) such as
      `http://localhost:5173` explicitly in dev/test configuration, and audit
      `vite.config.ts` / reverse-proxy behavior so the server can distinguish
      the browser-facing origin from the internal app-server origin without
      trusting arbitrary client-supplied forwarded headers.

**Deliverables**: after setup, unauthenticated API calls to product/runtime
routes are rejected; missing auth state after setup fails closed into repair;
local admin can log in and out; mutating authenticated API calls require Cats
CSRF; repeated invalid logins are throttled.

### Phase 3: Renderer Setup and Login UX

- [ ] Task 3.1: Update `/setup` step 1 to collect first-admin local
      credentials without conflating login account fields with owner profile.
- [ ] Task 3.2: Add `/login` route and login screen for existing workspaces.
- [ ] Task 3.3: Update platform bootstrap loading so unauthenticated app loads
      redirect to `/login` instead of surfacing raw API failures.
- [ ] Task 3.4: Add logout action in an existing account/settings surface.
- [ ] Task 3.5: Verify Vite dev proxy and built server both preserve
      Set-Cookie / Cookie behavior after the Phase 2 origin-preservation work
      has landed. Keep `vite.config.ts` proxy `changeOrigin`,
      `cookieDomainRewrite`, and `cookiePathRewrite` behavior covered by the
      Phase 2 auth-gate tests so dev and packaged flows do not diverge.

**Deliverables**: a user can create the first local admin, reload the app,
log out, log back in, and access Chat/Work/Code only while authenticated.

### Phase 4: Browser Google Identity Provider

- [ ] Task 4.1: Choose and add the ID-token verifier dependency after checking
      dependency footprint and Node ESM compatibility.
- [ ] Task 4.2: Implement server-side Google token verification for signature,
      `aud`, `iss`, `exp`, optional `hd`, and verified email.
- [ ] Task 4.3: Add Google bootstrap/login endpoints that create or link a
      Google identity to a Cats account.
- [ ] Task 4.4: Add Google Identity Services frontend integration gated by
      `CATS_AUTH_GOOGLE_CLIENT_ID`.
- [ ] Task 4.5: Add UI fallback messaging for raw LAN-IP / unavailable Google
      origin cases.
- [x] Task 4.6: Validate Google CSRF token handling for GIS POST credential
      submissions separately from Cats authenticated-API CSRF.

**Deliverables**: Google can create the first admin or log in an existing
linked account on supported origins; local password remains available.

### Phase 4b: Expo Go / Cats Mobile Device Sessions

This phase must land before mobile pairing is advertised as a data-access
feature. ADR-095 / SPEC-099 may expose static manifest and bundle routes, but
the mobile app cannot read Chat, Work, Code, Core, runtime proxy, shell helper,
or transport data until this phase exists.

- [x] Task 4b.1: Extend auth state and session helpers with
      `kind: 'mobile_device'`, token hashing, expiration, revocation,
      last-seen updates, and device metadata.
- [x] Task 4b.2: Add mobile auth routes for status, local login, logout, and
      session revocation. Successful mobile login returns the raw bearer token
      exactly once; persisted state stores only the hash.
- [ ] Task 4b.3: Add route-gate support for `Authorization: Bearer` mobile
      device sessions. Browser cookie sessions still require the browser
      CSRF/origin policy; mobile bearer sessions do not require
      `X-Cats-CSRF-Token`.
- [ ] Task 4b.4: Wire Cats Mobile launch flow so QR-loaded apps call mobile
      auth status first, show login when unauthenticated, and fetch product
      data only after a valid mobile session exists.
- [ ] Task 4b.5: Store mobile bearer tokens through the mobile secure-storage
      adapter backed by Expo SecureStore when available. Do not store tokens in
      AsyncStorage, URLs, logs, app-shell payloads, or manifests.
- [x] Task 4b.6: Add mobile local-login throttling to the same composite
      lockout and aggregate brute-force guard policy used by browser login.
- [ ] Task 4b.7: Add mobile Google login using Expo AuthSession, a native
      Google provider, or another approved mobile OAuth/OIDC flow. Keep it
      separate from the browser GIS credential POST route and verify the
      resulting ID token or code exchange server-side against
      `CATS_AUTH_GOOGLE_MOBILE_AUDIENCES`.
- [ ] Task 4b.8: Add tests proving mobile manifest/bundle routes contain no
      product data or credentials, unauthenticated mobile API calls receive
      `E_UNAUTHENTICATED`, valid mobile bearer sessions resolve to the same
      principal shape as browser sessions, and browser CSRF cannot be bypassed
      by omitting `X-Cats-CSRF-Token` without a bearer token.

**Deliverables**: Expo Go can load the mobile bundle from the QR, requires
local or Google login before data access, stores a mobile device token
securely, and can revoke/logout without deleting all auth state.

### Phase 5: Principal Propagation and Multi-User Readiness

- [ ] Task 5.1: Add `auth` / `principal` to shared route contexts without
      reshaping frozen product contracts.
- [ ] Task 5.2: Preserve only the first admin's explicit `actor-owner` mapping
      for existing single-owner writes. Later memberships default
      `coreActorId` to `null`; write paths that need Core actor attribution
      must fail closed until explicit mapping exists.
- [ ] Task 5.3: Add forward-invariant attribution tests that create a second
      admin membership with `coreActorId: null` and assert actor-attributed
      writes fail closed instead of silently using `actor-owner`.
- [ ] Task 5.4: Document the follow-up boundary for account management UI and
      non-admin roles.

**Deliverables**: the codebase has a clear path from browser session to future
Core actor attribution without requiring the first auth slice to rewrite every
product write path.

### Phase 6: Hardening, Documentation, and Regression Tests

- [x] Task 6.1: Add route-gate tests covering setup incomplete, setup complete
      unauthenticated, authenticated admin, and forbidden cases.
- [x] Task 6.2: Add auth-store tests for password hash ownership, session
      revocation, expiration, and token-hash lookup.
- [x] Task 6.3: Add Google verifier tests with injected fake verifier/JWKS
      instead of live Google calls.
- [ ] Task 6.4: Add CSRF tests for Google credential POST and authenticated
      mutations.
- [ ] Task 6.5: Update `docs/api.md`, `docs/setup-guide.md`,
      `docs/deployment.md`, and `.env.example`. The setup-guide and deployment
      docs shall explicitly document:
      (a) the forgotten-credential escape hatch — the exact path to the
      persisted auth state file for both packaged and dev deployments, and a
      warning that deleting it discards all sessions, identities, and
      memberships while leaving owner profile, Guide Cat state, and product
      data untouched;
      (b) the recovery flow constraint — repair first-admin creation only
      accepts loopback requests OR a one-time recovery token written to
      `<state-dir>/auth-recovery-token.local.txt` at repair-mode start-up;
      structured logs expose only the token file path, not the raw token;
      LAN-bound deployments should rebind to loopback or use the recovery
      token before allowing the LAN to reach the host during recovery.
- [ ] Task 6.6: Add release notes covering: (a) LAN-facing workspaces now
      require login after setup; (b) `CATS_AUTH_ENABLED=false` is rejected
      after `setupCompleteAt`; (c) the auth state file escape hatch and the
      loopback/recovery-token constraint on the repair flow; (d) pinned
      `E_UNAUTHENTICATED` / `E_FORBIDDEN` / `E_CSRF_MISMATCH` error codes
      that downstream tooling can rely on.
- [x] Task 6.7: Update mobile pairing docs to state that the Expo Go QR loads
      only the mobile bundle; Cats Mobile must complete local or Google mobile
      login before any product data is fetched.

**Deliverables**: auth behavior is documented, tested, and visible to
operators before implementation is marked complete.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/platform/auth/**` | Create | Auth state, password, session, Google verifier, and policy helpers |
| `src/platform/auth/actorAttribution.ts` | Create | Fail-closed Core actor attribution helper for authenticated principals |
| `src/platform/auth/googleAccount.ts` | Create | Google first-admin account bootstrap helper |
| `src/platform/auth/googleCsrf.ts` | Create | Google GIS double-submit CSRF validation helper |
| `src/platform/auth/googleVerifier.ts` | Create | Injected Google ID-token verifier contract and claim validation |
| `src/platform/auth/localLogin.ts` | Create | Shared local password credential verification for browser/mobile/repair routes |
| `src/platform/auth/readiness.ts` | Create | Setup/auth-state readiness helper that drives post-setup repair mode |
| `src/app/server/authRoutes.ts` | Create | Auth status/login/logout/bootstrap routes |
| `src/app/server/authGate.ts` | Create | Shared route-gate decision helper for browser cookie and mobile bearer principals |
| `src/app/server/googleAuthRequest.ts` | Create | Google credential POST parser for GIS form posts and JSON tests |
| `src/app/server/mobileAuthRoutes.ts` | Create | Mobile status/login/logout/revocation routes issuing bearer device sessions |
| `src/app/server/requestRouter.ts` | Modify | Install auth gate before product/runtime route dispatch |
| `src/app/server/contracts.ts` | Modify | Add auth dependencies/principal to resolved route contexts |
| `src/app/server/dependencies.ts` | Modify | Wire auth store and verifier dependencies |
| `src/config.ts` | Modify | Parse auth, allowed browser origins, and Google provider configuration |
| `vite.config.ts` | Modify | Preserve browser-origin/cookie behavior for auth routes in dev proxy |
| `src/shared/platform-contract.ts` | Modify | Expose auth/session/provider availability in app shell payload |
| `src/app/renderer/App.tsx` | Modify | Route unauthenticated users to `/login` after setup |
| `src/app/renderer/setup/**` | Modify | Add first-admin local credential and optional Google bootstrap UI |
| `src/app/renderer/auth/**` | Create | Login screen and auth API client |
| `mobile/**` | Modify | Add mobile auth status/login/logout flow, secure token storage, and mobile Google provider integration |
| `mobile/src/api/auth.ts` | Create | Cats Mobile auth API wrapper for status, local login, and logout |
| `mobile/src/api/authTokenStore.ts` | Create | Secure-storage-only bearer token persistence boundary for Cats Mobile |
| `src/mobile/**` | Modify | Keep shared mobile contracts aligned with mobile auth status and bearer-session requirements |
| `src/app/server/platformSetupRoutes.ts` | Modify | Canonical platform setup route; create first admin during platform setup |
| `src/products/chat/api/setupRoutes.ts` | Audit/Delete or Modify | Legacy setup/reset route; remove if unused, otherwise align with the canonical auth gate and require admin auth after setup |
| `tests/*auth*.test.*` | Create | Store, route gate, setup/login/logout, and Google verifier coverage |
| `.env.example` | Modify | Document auth and Google config |
| `docs/api.md` | Modify | Document auth status and route protection |
| `docs/setup-guide.md` | Modify | Document first admin setup and Google origin caveats |
| `docs/deployment.md` | Modify | Document LAN/tunnel auth expectations |
| `docs/release-notes.md` | Modify | Document login requirement behavior change |

## Technical Decisions

- Auth belongs at the platform host boundary because `cats-platform` owns the
  browser ingress surface.
- Google is a provider identity, not the authorization layer.
- Expo Go QR pairing is bundle bootstrap, not authorization. Static mobile
  manifest/bundle/assets routes may be public when pairing is enabled, but
  product-data APIs require an auth principal.
- Cats Mobile is a first-party non-browser client. It uses mobile device
  bearer sessions, not browser HttpOnly cookies, browser CSRF, or
  allowed-browser-origin headers.
- Mobile Google login is separate from browser Google Identity Services:
  mobile uses AuthSession/native OAuth/OIDC and the server verifies the
  resulting token/code against mobile audiences.
- Mobile bearer tokens are returned once, stored as hashes server-side, and
  stored in Expo SecureStore or equivalent secure storage client-side.
- Local admin credentials are required even if Google is configured, because
  Google Web OAuth is a poor fit for raw LAN IP and offline local-first use.
- Auth state is separate from owner profile and Chat state.
- Once `setupCompleteAt` exists, auth fails closed even if auth state is
  missing, unreadable, or corrupt; repair surfaces do not make product APIs
  public.
- Session cookies use `SameSite=Lax` so Google credential POST flows are not
  broken by a stricter default.
- `/api/auth/status` is the canonical source for Cats synchronizer CSRF tokens;
  app-shell/bootstrap payloads may mirror but not mint or rotate them.
- Authenticated Cats API mutations use synchronizer CSRF tokens and rotate
  them on login/session creation; rotation on privilege changes is a
  forward-looking guarantee dormant in v1 (no role-mutation paths exist yet).
  Google credential POST validates the separate GIS `g_csrf_token` contract.
- Unauthenticated `/api/auth/status` and bootstrap envelope responses do not
  return a CSRF token; the field is absent or `null`.
- Stale-token recovery: renderer treats a `403` with
  `code: 'E_CSRF_MISMATCH'` as a refresh signal — re-fetch
  `/api/auth/status` and retry once; a second consecutive mismatch is a hard
  error. The renderer never retries on `E_FORBIDDEN` or any other `403`
  code, and never matches on user-visible text.
- Pre-auth bootstrap defense: `/setup` first-admin, `/api/auth/login`,
  repair first-admin, and Google credential POST are all guarded by an
  `Origin` + `Sec-Fetch-Site` allowed-browser-origin gate. The gate uses a
  configured allowlist of browser-facing origins, including Vite dev origins,
  and does not trust arbitrary forwarded headers. `same-site` is accepted only
  when `Origin` is allowlisted; it is not treated as same-origin by itself.
  This sits in addition to, not in place of, the synchronizer CSRF token used
  by authenticated mutations and the `g_csrf_token` double-submit used by
  Google credentials.
- Repair-mode admin bootstrap is loopback-only OR requires a one-time
  recovery token written to a restrictive state-dir file at repair start-up.
  Structured logs never contain the raw token; an interactive local console may
  print it only when not routed into structured/remote logging. Token is
  single-use, rotates per restart, and is invalidated after first-admin
  re-creation. This prevents the escape hatch from re-opening LAN admin
  bootstrap.
- Login throttle hard-lockout key is composite `(account, address)`;
  per-account progressive delay, bounded per-account 24-hour cooldown, and
  per-/24 subnet budget are mandatory aggregate guards on top. Cooldowns expire
  by TTL and can be cleared by admin/loopback/recovery token flow, so the
  single v1 owner is not forced into deleting auth state after mistakes.
- Auth/CSRF gate uses pinned structured error codes (`E_UNAUTHENTICATED` /
  `E_FORBIDDEN` / `E_CSRF_MISMATCH`) rather than relying on HTTP status
  alone, so client retry logic stays correct and decoupled from copy
  changes.
- After `setupCompleteAt`, `CATS_AUTH_ENABLED=false` is rejected on every host
  (uniform rule, no loopback warning shortcut).
- v1 has no in-band password reset; deleting the persisted auth state file is
  the documented escape hatch for forgotten credentials and triggers the
  repair flow on next start.
- Only the first admin maps to `actor-owner`; later memberships require
  explicit Core actor mapping before actor-attributed writes can proceed.
- The `coreActorId: null` fail-closed path is a forward-looking invariant
  guard; v1 has only the first-admin UI path, but tests should prevent future
  multi-account work from regressing attribution.
- The first rollout should expose principal data to route handlers but avoid a
  broad rewrite of every existing product write path.

## Testing Strategy

- **Unit Tests**:
  - password hash/verify rejects wrong password and never exposes plaintext;
  - session creation stores only token hashes and rejects expired/revoked
    sessions;
  - mobile device session creation returns the raw bearer token only once,
    stores only the token hash, records `kind: 'mobile_device'`, and updates
    `lastSeenAt` on authenticated use;
  - only the first admin membership receives `coreActorId: 'actor-owner'`;
  - actor-attributed write helpers fail closed when principal membership has
    `coreActorId: null`;
  - login throttling locks the composite `(account_or_provider_subject,
    remote_address)` key, allows other (account, address) pairs to keep
    trying, and logs without leaking credentials;
  - per-account progressive delay grows with recent failure count from any
    source and resets on successful login;
  - per-account 24-hour failure budget triggers logged alert and extended
    cooldown that survives across distributed source addresses, expires by TTL,
    and can be cleared through admin/loopback/recovery-token recovery without
    deleting auth state;
  - per-/24 subnet failure budget cools the subnet down when the same /24
    drives failures across many accounts;
  - aggregate guard thresholds are configurable but cannot be disabled
    entirely;
  - recovery-token issuance: at repair-mode start-up the platform writes a
    fresh single-use token only to the state-dir token file, rotates it on
    every restart, invalidates it after first-admin re-creation, and never
    places the raw token in structured logs;
  - auth-state validation treats JSON parse failures, missing required
    top-level fields, and too-new schema versions as corrupt while preserving
    unknown extra fields;
  - config validation rejects `CATS_AUTH_ENABLED=false` whenever
    `setupCompleteAt` exists, on every host, with a structured configuration
    error rather than a silent warning;
  - Google verifier wrapper checks expected claims using injected test payloads;
  - mobile Google verifier wrapper accepts only configured mobile audiences and
    rejects browser-only or unknown client IDs.
- **Integration Tests**:
  - setup incomplete allows setup bootstrap and blocks product APIs;
  - setup complete with missing/unreadable auth state enters repair and keeps
    protected APIs closed;
  - setup complete unauthenticated returns `401` for protected APIs;
  - authenticated admin can access app shell, Chat, Work, Core, and runtime
    proxy routes;
  - mobile manifest/bundle/assets routes can be fetched when mobile pairing is
    enabled but never return product data, auth state, bearer tokens, or Google
    tokens;
  - mobile product-data requests without `Authorization: Bearer` return `401`,
    while the same request with a valid mobile device session receives the same
    principal shape as a browser session;
  - mobile bearer requests are not required to send `X-Cats-CSRF-Token`, and
    browser cookie requests cannot bypass CSRF by pretending to be mobile
    without a valid bearer token;
  - setup reset requires admin after setup;
  - mutating authenticated API routes reject missing or mismatched
    `X-Cats-CSRF-Token`;
  - `/api/auth/status` is the canonical CSRF-token source and app-shell mirrors
    the same token without rotating it;
  - unauthenticated `/api/auth/status` and bootstrap envelope responses do not
    return a CSRF token (field is absent or `null`);
  - Cats CSRF middleware is not registered on Google credential POST routes;
    Cats mutation routes reject requests that supply only `g_csrf_token`
    without a valid `X-Cats-CSRF-Token` and never silently accept the Google
    token as a substitute;
  - deleting the persisted auth state file with `setupCompleteAt` already set
    triggers the repair flow on next start without exposing protected APIs;
  - pre-auth mutating endpoints (`/setup` first-admin, `/api/auth/login`,
    repair first-admin, Google credential POST) reject requests with a
    cross-site `Origin`, with `Sec-Fetch-Site: cross-site`, with
    `Sec-Fetch-Site: same-site` but no allowlisted `Origin`, with
    `Sec-Fetch-Site: none` on an API mutation, or with `Origin` absent on a
    non-`GET`;
  - Vite dev origin (for example `http://localhost:5173`) succeeds only when it
    is configured in `CATS_AUTH_ALLOWED_BROWSER_ORIGINS`, and arbitrary
    forwarded-origin headers from clients are ignored unless they came through
    a configured trusted proxy hop;
  - the allowed-browser-origin gate is enforced on Google credential POST and is not
    bypassed by provider name;
  - the repair first-admin creation endpoint rejects requests from non-loopback
    addresses without a valid recovery token, accepts loopback requests
    without a token, and accepts non-loopback requests with the issued
    token; the token is single-use and a second attempt with the same token
    is rejected;
  - error responses from the auth/CSRF gate carry stable `code` fields
    (`E_UNAUTHENTICATED`, `E_FORBIDDEN`, `E_CSRF_MISMATCH`) and renderer
    retry logic keys on those codes only;
  - logout revokes session and clears cookie.
- **Renderer Tests**:
  - setup shows local credential fields;
  - login route appears after unauthenticated app-shell load;
  - on a `403` with `code: 'E_CSRF_MISMATCH'` the renderer re-fetches
    `/api/auth/status` and retries the original mutation exactly once; a
    second consecutive `E_CSRF_MISMATCH` surfaces a hard error instead of
    silent retry;
  - the renderer does NOT retry on `403` with `code: 'E_FORBIDDEN'` or any
    other `403` code, and does not pattern-match on user-visible error text;
  - Google button hides when not configured and uses the client ID from the
    minimal auth/provider envelope when configured.
- **Mobile Tests**:
  - first Expo Go launch loads bundle/bootstrap only, then shows login before
    fetching product data;
  - local mobile login stores the bearer token via the secure-storage adapter,
    not AsyncStorage;
  - mobile logout deletes the local secure token and revokes the server
    session;
  - mobile Google login uses the mobile OAuth/OIDC flow and does not call the
    browser GIS credential POST route.
- **Manual Testing**:
  - localhost dev with local admin;
  - LAN IP dev with local admin;
  - localhost Google login with configured client ID;
  - HTTPS tunnel Google login when available.
  - Expo Go on iOS and Android: QR loads the bundle, unauthenticated app shows
    login, local mobile login unlocks data, logout returns to login.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auth gate breaks existing tests | High | Add test helpers for authenticated requests; land gate in a dedicated slice |
| Missing auth state after setup accidentally disables auth | High | Treat `setupCompleteAt` as fail-closed and route only to repair/login/bootstrap surfaces |
| Expo Go QR mistaken for authorization | High | Document and test that QR/manifest/bundle routes contain no product data or credentials; mobile product-data routes require mobile bearer sessions |
| Local admin login becomes brute-forceable on LAN | High | Add per-address and per-account/provider throttling with default lockout |
| Google OAuth does not work on LAN IP | Medium | Keep local admin path first-class; hide/fallback Google where unavailable |
| Browser auth middleware blocks mobile clients | Medium | Keep browser CSRF/origin checks scoped to browser cookie sessions; bearer sessions use Authorization header validation instead |
| Mobile bearer token leaks from client storage | High | Use SecureStore/equivalent secure storage, never AsyncStorage/logs/URLs/manifests; support session revocation |
| Mobile Google and browser GIS flows are conflated | High | Keep mobile AuthSession/native OAuth routes separate from browser GIS credential POST; verify mobile audiences explicitly |
| Cookie/origin behavior differs between Vite proxy and built server | Medium | Put Vite origin preservation in Phase 2 atomic work; add explicit dev and built-server session/origin tests |
| Password/session local state becomes sensitive | High | Store only salted password hashes and session token hashes; document state reset |
| Route allowlist accidentally leaves a privileged route public | High | Add static route-policy tests and review runtime/shell/transport routes explicitly |
| Cats CSRF and Google GIS CSRF are conflated | High | Keep Cats auth routes and Google credential routes in distinct modules; add static tests that `X-Cats-CSRF-Token` middleware is not registered on Google credential routes and that Cats mutation routes reject requests supplying only `g_csrf_token` |
| Operator forgets the only admin credential and bricks their workspace | High | Document the auth-state-file escape hatch in setup-guide, deployment, and release notes; ensure the repair flow does not require the lost password |
| Escape hatch re-opens LAN admin bootstrap | High | Constrain repair first-admin creation to loopback OR a one-time recovery token written to a restrictive state-dir file; never expose the repair endpoint as a plain LAN-reachable bootstrap; document the loopback/token requirement in deployment docs |
| Pre-auth CSRF on `/setup` / `/api/auth/login` / repair from cross-site POST | High | Allowed-browser-origin gate via `Origin` + `Sec-Fetch-Site` on all pre-auth mutating endpoints, including Google credential POST; static test that the gate is registered on every pre-auth route |
| Distributed brute force shares budget per account | High | Mandatory aggregate guards: per-account progressive delay, bounded per-account 24-hour cooldown with non-destructive recovery, per-/24 subnet failure budget; cannot be disabled |
| Renderer retries non-CSRF `403` and masks real authz failures | Medium | Pin `code: 'E_CSRF_MISMATCH'`; renderer keys retry on that code only; static test asserts no retry on `E_FORBIDDEN` |
| Legitimate admin DoS via per-account global hard lockout | Medium | Use composite `(account, address)` hard-lockout key; aggregate guards add delay and bounded cooldowns with TTL/admin/loopback/recovery-token clearing |
| Stale CSRF token after rotation breaks UX silently | Medium | Renderer must refresh `/api/auth/status` on `E_CSRF_MISMATCH` and retry once; a second mismatch surfaces a hard error |
| `CATS_AUTH_ENABLED=false` honored after setup re-opens LAN exposure | High | Reject the override as a configuration error after `setupCompleteAt` on every host; cover with config-validation tests |
| Future multi-user attribution is blocked by first slice shortcuts | Medium | Carry principal in route context and fail closed for `coreActorId: null` instead of mapping every admin to owner |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-30 | Plan created with ADR-096 and SPEC-100 after LAN access exposed the missing general auth boundary. |
| 2026-04-30 | Tightened auth invariants: composite `(account, address)` throttle key; uniform `CATS_AUTH_ENABLED=false` rejection after `setupCompleteAt`; pre-setup row clarified in the gate table; pre-auth CSRF token explicitly absent; renderer stale-CSRF retry contract; rotation on privilege changes marked forward-looking; auth-state-file escape hatch for forgotten credentials documented. |
| 2026-04-30 | Closed pre-auth bootstrap CSRF gap with allowed-browser-origin gate on `/setup`/`/api/auth/login`/repair; constrained repair first-admin creation to loopback or one-time recovery token so the escape hatch does not re-open LAN admin bootstrap; pinned `E_CSRF_MISMATCH` / `E_FORBIDDEN` / `E_UNAUTHENTICATED` error codes; promoted per-account aggregate guards (progressive delay, bounded daily cooldown, per-/24 subnet budget) from optional to required. |
| 2026-04-30 | Aligned origin gate with Vite/reverse-proxy reality: allowed browser-origin set is explicit and Phase 2 atomic, `same-site` no longer passes without an allowlisted `Origin`, recovery tokens stay out of structured logs, and aggregate cooldowns have TTL/non-destructive recovery so the v1 owner is not forced to delete auth state. |
| 2026-04-30 | Added Expo Go / Cats Mobile device-session slice: QR pairing remains bundle bootstrap only, mobile data access requires bearer device sessions, and mobile Google login is separate from browser GIS. |
| 2026-05-10 | Phase 1 landed: added `src/platform/auth/**` domain types, state normalization, memory/file auth stores, local password hashing, browser/mobile session token helpers, auth config parsing, and focused tests. No route gate is enabled yet. |
| 2026-05-10 | Phase 2 route skeleton started: added `/api/auth/status`, local `/api/auth/login`, `/api/auth/logout`, auth-store dependency wiring, browser-origin gate for login, session cookie issuance/revocation, and route tests. Product route gate, setup bootstrap integration, CSRF middleware, throttling, and repair flow remain pending. |
| 2026-05-10 | Phase 2 throttling slice started: auth state now carries failed-login and bounded cooldown records, local password login enforces composite `(account, address)` lockout plus account/subnet aggregate guards, and focused throttle/route tests cover local login. Google credential throttling, admin cooldown clearing, and repair-token clearing remain pending before Tasks 2.10/2.11 can be checked off. |
| 2026-05-10 | Phase 2 CSRF slice started: browser logout now resolves the active Cats session and requires the session synchronizer `X-Cats-CSRF-Token`, with missing/stale-token route tests. Product mutations, setup reset, and renderer stale-CSRF retry remain pending before Task 2.2 can be checked off. |
| 2026-05-10 | Phase 2 route-policy slice started: added a server-side auth gate classifier for pre-setup, post-setup, and repair phases with focused tests for public renderer/auth/mobile/bootstrap routes and protected product/Core/runtime/shell/transport/subscription APIs. The classifier is not installed in `requestRouter` yet, so Tasks 2.5/2.6 remain unchecked until principal resolution, minimal envelopes, setup bootstrap, and repair are wired atomically. |
| 2026-05-10 | Phase 2 minimal-envelope slice started: added an auth/bootstrap envelope builder that exposes only setup routing state, unauthenticated auth/provider availability, and response metadata while explicitly omitting Chat/Lobby/runtime/product data. It is not yet served by `/api/app-shell`, so Task 2.7 remains unchecked until the auth gate installs it. |
| 2026-05-10 | Phase 2 first-admin setup slice started: platform setup completion can now accept local admin credentials, prepare the first auth account/identity/membership/session, persist auth state, and return a browser session cookie. The renderer setup form, pre-auth origin gate on setup, and making credentials mandatory are still pending before Task 2.3 can be checked off. |
| 2026-05-10 | Phase 2 pre-auth origin helper slice landed: extracted the shared allowed-browser-origin / `Sec-Fetch-Site` decision helper and rewired `/api/auth/login` to use it. Setup, repair, and Google credential POST still need to call the helper before Task 2.12 can be checked off. |
| 2026-05-10 | Phase 2 principal resolver slice started: extracted browser session principal resolution and stable principal summaries for reuse by auth routes and the future request gate. Mobile bearer principal resolution remains pending. |
| 2026-05-10 | Phase 2 CSRF helper slice started: extracted Cats synchronizer CSRF token validation so logout and the future authenticated route gate share one token/hash decision path. Product mutation middleware remains pending before Task 2.2 can be checked off. |
| 2026-05-10 | Phase 5 prerequisite slice started ahead of route-gate integration: principal resolution now supports mobile bearer `mobile_device` sessions without browser CSRF. Mobile HTTP auth routes and secure-client storage remain pending. |
| 2026-05-10 | Phase 2 repair prerequisite slice started: added one-time recovery token helpers that write the raw token only to the configured local recovery-token file while keeping only an HMAC hash in memory and supporting single-use consumption. The repair-mode detector and constrained first-admin route remain pending before Task 2.13 can be checked off. |
| 2026-05-10 | Phase 2 effective-mode slice started: added the effective auth-gate mode resolver so `CATS_AUTH_ENABLED=false` is allowed only on loopback before setup, and becomes a configuration error after setup or on LAN/packaged hosts. Startup enforcement is still pending. |
| 2026-05-10 | Phase 4b mobile auth route slice landed: added `/api/mobile/auth/status`, `/api/mobile/auth/login`, and `/api/mobile/auth/logout`, issuing one-time-returned bearer device tokens backed by hashed `mobile_device` sessions, sharing the local-login throttle policy, and routing mobile auth before the mobile manifest pairing fallback. Product-data route gating and mobile secure-token client storage remain pending. |
| 2026-05-10 | Phase 2/4b route-policy follow-up landed: mobile auth routes are explicitly public, mobile static bootstrap is narrowed to manifest/bundle/assets, and unknown/future mobile product-data paths remain protected for the future bearer-session gate. The classifier is still not installed in `requestRouter`. |
| 2026-05-10 | Phase 2/4b route-gate decision slice started: added a shared auth-gate evaluator that classifies routes, resolves browser cookie or mobile bearer principals, requires Cats CSRF on mutating browser-cookie requests, and allows valid mobile bearer mutations without browser CSRF. The evaluator is tested but not yet installed in `requestRouter`, so product routes remain publicly dispatched until the atomic gate slice lands. |
| 2026-05-10 | Phase 2 repair readiness slice started: added a setup/auth-state readiness helper that maps pre-setup, post-setup, and post-setup missing/corrupt auth state into explicit gate phases and repair reasons. Startup repair detector, recovery-token route, and request-router enforcement remain pending. |
| 2026-05-10 | Phase 4 Google verifier contract slice started: added an injected Google ID-token verifier interface plus server-side claim validation for issuer, audience, expiration, verified email, hosted-domain allowlist, and mobile audiences. The maintained verifier dependency and browser/mobile Google login routes remain pending before Tasks 4.1-4.3/4b.7 can be checked off. |
| 2026-05-10 | Local credential verification was extracted behind `verifyPlatformLocalPasswordCredential` and both browser and mobile local-login routes now use the shared helper. This reduces route drift before adding Google and repair bootstrap routes. |
| 2026-05-10 | Phase 2 pre-auth origin gate expanded to `/api/platform/setup/complete`, so first-admin setup mutations now require an allowlisted browser origin and reject missing/cross-site origins with pinned `E_FORBIDDEN`. Repair and Google credential POST still need the same gate before Task 2.12 can be checked off. |
| 2026-05-10 | Phase 4b mobile client API slice started: Cats Mobile now has auth API wrappers for status/local-login/logout, and the generic mobile API client can attach a runtime bearer token without persisting it to AsyncStorage. SecureStore-backed token persistence and launch-flow login UI remain pending before Tasks 4b.4/4b.5 can be checked off. |
| 2026-05-10 | Phase 6 documentation slice started: `.env.example`, API docs, setup guide, and release notes now document the auth rollout status, session secret, origin allowlist, mobile auth routes, and the fact that the global product-route gate is not installed yet. Full recovery-flow documentation remains pending. |
| 2026-05-10 | Phase 4b secure-token boundary slice started: Cats Mobile now has an injected secure-storage token store boundary for bearer tokens, with no AsyncStorage path for auth tokens. Wiring the real Expo SecureStore module into launch/login/logout UI remains pending before Task 4b.5 can be checked off. |
| 2026-05-10 | Phase 5 attribution prerequisite slice started: added a fail-closed helper for resolving Core actor attribution from authenticated principals, so memberships with `coreActorId: null` cannot silently fall back to `actor-owner`. Product write paths still need to adopt the helper before Tasks 5.1-5.3 can be checked off. |
| 2026-05-10 | Auth gate response adapter slice landed: the shared gate evaluator now has a single HTTP rejection sender for pinned `E_UNAUTHENTICATED` and `E_CSRF_MISMATCH` JSON bodies. Request-router installation remains pending. |
| 2026-05-10 | Phase 4 Google account bootstrap slice started: added a domain helper for creating the first admin account, Google identity, owner/admin membership, and browser session from a verified Google identity. Browser Google HTTP setup/login routes remain pending. |
| 2026-05-10 | Phase 4 Google linked-login domain slice landed: added a helper that issues a browser session for an existing active linked Google identity, refreshes display email/avatar metadata, and fails closed for unknown or disabled accounts. Browser Google HTTP route remains pending. |
| 2026-05-10 | Phase 4 Google CSRF prerequisite slice landed: added a Google GIS `g_csrf_token` double-submit validator that is separate from Cats synchronizer CSRF. Browser Google credential POST route remains pending. |
| 2026-05-10 | Reconciled completed checkboxes for the landed server/mobile auth foundations: Tasks 2.1, 2.3, 4b.1, 6.2, 6.3, and 6.7 are now marked complete. The global route gate, repair flow, renderer login UX, and Google HTTP routes remain open. |
| 2026-05-10 | Phase 4 Google credential request parser slice landed: added a parser for Google GIS `application/x-www-form-urlencoded` credential posts plus JSON test clients, returning normalized credential and `g_csrf_token` values. Browser Google HTTP route remains pending. |
| 2026-05-10 | Phase 4 browser Google linked-login route slice started: `/api/auth/google/login` now enforces the pre-auth origin gate, GIS double-submit CSRF, injected Google ID-token verifier, linked-account lookup, Google throttling records, and browser session cookie issuance for existing linked accounts. First-admin Google setup/linking and real verifier dependency remain pending. |
| 2026-05-10 | Google route lockout regression added and completed task reconciliation updated: Task 2.10 is checked for local+Google composite failed-login lockout, and Task 4.6 is checked for GIS CSRF validation remaining separate from Cats synchronizer CSRF. Aggregate guard recovery/clearing work remains under Task 2.11. |
| 2026-05-10 | Phase 6 route-gate readiness regression slice landed: focused tests now cover pre-setup product API rejection with public minimal app-shell, setup-complete unauthenticated rejection, setup-complete authenticated admin access, repair-mode fail-closed behavior, and browser-cookie mutation CSRF rejection. The evaluator is still not installed in `requestRouter`. |
| 2026-05-10 | Phase 2 setup-reset protection landed: legacy `/api/setup/reset` now requires an authenticated admin browser session after setup completion and validates the Cats synchronizer CSRF token before clearing setup state. Full product mutation CSRF middleware remains pending under Task 2.2/6.4. |
| 2026-05-10 | Phase 2 origin-preservation follow-up landed for Vite dev: renderer proxy routes now use explicit proxy objects with `changeOrigin: false` plus cookie domain/path rewrite settings so browser-origin and session-cookie behavior remain stable during auth testing. Reverse-proxy deployment audit remains pending before Task 2.15 is checked off. |
| 2026-05-10 | Phase 2 repair-startup prerequisite landed: added a helper that issues the one-time recovery token only when readiness is in repair mode and returns a structured log payload containing the reason and token-file path but not the raw token. Startup wiring and the constrained repair first-admin route remain pending. |

---

*Created: 2026-04-30*
*Author: Codex*
