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
  -> attribution and multi-user follow-through
```

The first working milestone is local admin auth. Google should not block the
server-side route gate because Google Web OAuth has origin restrictions that
make raw LAN-IP access unreliable.

## Implementation Phases

### Phase 1: Auth Domain and Configuration

- [ ] Task 1.1: Add platform auth types for accounts, identities, sessions,
      memberships, and principals.
- [ ] Task 1.2: Add an auth state store beside existing platform state paths,
      with memory-store test support and file-store production support.
- [ ] Task 1.3: Add auth config parsing for session secret, session TTL,
      Google client ID, Google hosted-domain allowlist, and explicit dev/test
      auth mode.
- [ ] Task 1.4: Add password hashing helpers using Node crypto or an approved
      dependency, with algorithm/version metadata in stored password identities.
- [ ] Task 1.5: Add session token generation, token hashing, expiration, and
      revocation helpers.

**Deliverables**: auth state can be read/written in isolated tests; local
password hashes and session tokens are never stored in plaintext.

### Phase 2: Server Auth Gate and Local Admin Bootstrap

- [ ] Task 2.1: Add a platform auth route module:
      `/api/auth/status`, `/api/auth/login`, `/api/auth/logout`, and local
      bootstrap/login helpers.
- [ ] Task 2.2: Extend setup completion so the local credentials path creates
      the first admin account, identity, membership, owner profile update, and
      session in one logical transaction.
- [ ] Task 2.3: Add the repair flow for existing setup-complete workspaces that
      have no auth state: require first-admin creation before protected product
      APIs become available.
- [ ] Task 2.4: Add platform request middleware before product route dispatch.
- [ ] Task 2.5: Implement public-route allowlists for pre-setup and post-setup
      states.
- [ ] Task 2.6: Return only a minimal setup/auth bootstrap envelope from
      unauthenticated app-shell reads.
- [ ] Task 2.7: Require admin auth for setup reset after setup is complete.
- [ ] Task 2.8: Add structured `401 unauthenticated` and `403 forbidden`
      responses.

**Deliverables**: after setup, unauthenticated API calls to product/runtime
routes are rejected; local admin can log in and out.

### Phase 3: Renderer Setup and Login UX

- [ ] Task 3.1: Update `/setup` step 1 to collect first-admin local
      credentials without conflating login account fields with owner profile.
- [ ] Task 3.2: Add `/login` route and login screen for existing workspaces.
- [ ] Task 3.3: Update platform bootstrap loading so unauthenticated app loads
      redirect to `/login` instead of surfacing raw API failures.
- [ ] Task 3.4: Add logout action in an existing account/settings surface.
- [ ] Task 3.5: Ensure Vite dev proxy and built server both preserve
      Set-Cookie / Cookie behavior.

**Deliverables**: a user can create the first local admin, reload the app,
log out, log back in, and access Chat/Work/Code only while authenticated.

### Phase 4: Google Identity Provider

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
- [ ] Task 4.6: Validate Google CSRF token handling for GIS POST credential
      submissions.

**Deliverables**: Google can create the first admin or log in an existing
linked account on supported origins; local password remains available.

### Phase 5: Principal Propagation and Multi-User Readiness

- [ ] Task 5.1: Add `auth` / `principal` to shared route contexts without
      reshaping frozen product contracts.
- [ ] Task 5.2: Preserve current `actor-owner` behavior for existing writes
      while making the session principal available to new write paths.
- [ ] Task 5.3: Add first attribution tests for approvals/operator actions or
      another low-risk Core write path.
- [ ] Task 5.4: Document the follow-up boundary for account management UI and
      non-admin roles.

**Deliverables**: the codebase has a clear path from browser session to future
Core actor attribution without requiring the first auth slice to rewrite every
product write path.

### Phase 6: Hardening, Documentation, and Regression Tests

- [ ] Task 6.1: Add route-gate tests covering setup incomplete, setup complete
      unauthenticated, authenticated admin, and forbidden cases.
- [ ] Task 6.2: Add auth-store tests for password hash ownership, session
      revocation, expiration, and token-hash lookup.
- [ ] Task 6.3: Add Google verifier tests with injected fake verifier/JWKS
      instead of live Google calls.
- [ ] Task 6.4: Add CSRF tests for Google credential POST and authenticated
      mutations.
- [ ] Task 6.5: Update `docs/api.md`, `docs/setup-guide.md`,
      `docs/deployment.md`, and `.env.example`.
- [ ] Task 6.6: Add release notes warning that LAN-facing workspaces now
      require login after setup.

**Deliverables**: auth behavior is documented, tested, and visible to
operators before implementation is marked complete.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/platform/auth/**` | Create | Auth state, password, session, Google verifier, and policy helpers |
| `src/app/server/authRoutes.ts` | Create | Auth status/login/logout/bootstrap routes |
| `src/app/server/requestRouter.ts` | Modify | Install auth gate before product/runtime route dispatch |
| `src/app/server/contracts.ts` | Modify | Add auth dependencies/principal to resolved route contexts |
| `src/app/server/dependencies.ts` | Modify | Wire auth store and verifier dependencies |
| `src/config.ts` | Modify | Parse auth and Google provider configuration |
| `src/shared/platform-contract.ts` | Modify | Expose auth/session/provider availability in app shell payload |
| `src/app/renderer/App.tsx` | Modify | Route unauthenticated users to `/login` after setup |
| `src/app/renderer/setup/**` | Modify | Add first-admin local credential and optional Google bootstrap UI |
| `src/app/renderer/auth/**` | Create | Login screen and auth API client |
| `src/products/chat/api/setupRoutes.ts` | Modify | Require auth for reset after setup; keep legacy setup route aligned |
| `src/app/server/platformSetupRoutes.ts` | Modify | Create first admin during platform setup |
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
- Local admin credentials are required even if Google is configured, because
  Google Web OAuth is a poor fit for raw LAN IP and offline local-first use.
- Auth state is separate from owner profile and Chat state.
- The first rollout should expose principal data to route handlers but avoid a
  broad rewrite of every existing product write path.

## Testing Strategy

- **Unit Tests**:
  - password hash/verify rejects wrong password and never exposes plaintext;
  - session creation stores only token hashes and rejects expired/revoked
    sessions;
  - Google verifier wrapper checks expected claims using injected test payloads.
- **Integration Tests**:
  - setup incomplete allows setup bootstrap and blocks product APIs;
  - setup complete unauthenticated returns `401` for protected APIs;
  - authenticated admin can access app shell, Chat, Work, Core, and runtime
    proxy routes;
  - setup reset requires admin after setup;
  - logout revokes session and clears cookie.
- **Renderer Tests**:
  - setup shows local credential fields;
  - login route appears after unauthenticated app-shell load;
  - Google button hides when not configured.
- **Manual Testing**:
  - localhost dev with local admin;
  - LAN IP dev with local admin;
  - localhost Google login with configured client ID;
  - HTTPS tunnel Google login when available.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auth gate breaks existing tests | High | Add test helpers for authenticated requests; land gate in a dedicated slice |
| Google OAuth does not work on LAN IP | Medium | Keep local admin path first-class; hide/fallback Google where unavailable |
| Cookie behavior differs between Vite proxy and built server | Medium | Add explicit dev and built-server session tests |
| Password/session local state becomes sensitive | High | Store only salted password hashes and session token hashes; document state reset |
| Route allowlist accidentally leaves a privileged route public | High | Add static route-policy tests and review runtime/shell/transport routes explicitly |
| Future multi-user attribution is blocked by first slice shortcuts | Medium | Carry principal in route context from the first implementation even if write paths still map to owner initially |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-30 | Plan created with ADR-096 and SPEC-100 after LAN access exposed the missing general auth boundary. |

---

*Created: 2026-04-30*
*Author: Codex*
