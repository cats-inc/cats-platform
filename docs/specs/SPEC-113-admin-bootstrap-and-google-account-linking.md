# SPEC-113: Admin Bootstrap and Google Account Linking

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Owner** | User |
| **Reviewer** | User |

## Summary

This spec closes the remaining account-lifecycle gap above the platform auth
foundation delivered by SPEC-100. Every real setup must create a local first
Admin, Settings must show truthful local/Google login-method state, and Google
link/unlink must be explicit, step-up-protected account actions. Google login
continues to accept only identities already linked by stable Google `sub`.

## Goals

- Make first-admin creation mandatory, serialized, and local-first.
- Give the owner a discoverable Google link/unlink surface in
  `Settings > General > Account`.
- Bind local-password reauthentication to one short-lived Google link or unlink
  action on the server.
- Require verified-email consistency and stable-provider-subject uniqueness.
- Preserve at least one usable login method and invalidate other sessions when
  Google is unlinked.
- Emit secret-free security events for sensitive identity lifecycle actions.
- Keep future last-active-admin safety explicit without adding multi-user UI.

## Non-Goals

- Account invitations, registration, automatic Google user creation, or
  automatic email-based account claiming.
- Admin list/create/delete/deactivate UI or role editing.
- Password reset, password change, recovery codes, MFA, passkeys, or WebAuthn.
- A durable audit-log database or user-facing audit viewer.
- Linking Google from Cats Mobile.
- Google API scopes, access tokens, refresh tokens, offline access, Drive, or
  Calendar authorization.
- A Google authorization-code flow for the browser. This slice retains Google
  Identity Services ID-token credentials.
- Headless first-admin creation through `ADMIN_EMAIL` or another environment
  variable.

## Current Baseline and Gaps

The existing implementation already provides:

- separate Account, Identity, Membership, and revocable Session records;
- local first-admin creation from the setup wizard;
- HttpOnly browser sessions, synchronizer CSRF, origin gates, and login
  throttling;
- server-side Google signature/audience/issuer/expiry/verified-email/hosted-
  domain verification;
- GIS double-submit CSRF validation;
- Google login restricted to an already-linked stable Google `sub`;
- backend Google setup and link routes plus renderer API wrappers.

The remaining gaps are:

- setup completion can omit Admin credentials at the HTTP contract;
- first-admin preparation reads auth state before the later write, so
  uniqueness is not rechecked inside one serialized mutation;
- Google-only first-admin creation is still reachable as an API despite having
  no supported setup UX;
- the link route does not require server-bound password step-up;
- the link domain may replace a non-null Cats account email with a different
  verified Google email;
- auth status does not expose linked login methods;
- Settings exposes sign-out but not Google link state or actions;
- no unlink route or session-invalidation policy exists;
- no identity-lifecycle security-event contract exists.

## User Stories

- As the owner, I want setup to leave me with a real local Admin login so I can
  recover when Google or the network is unavailable.
- As the owner, I want Settings to tell me whether Google is linked and which
  verified email is attached.
- As the owner, I want to link Google after confirming my local password so a
  stolen browser session cannot silently add a permanent login method.
- As the owner, I want an email mismatch explained before Cats changes any
  account state.
- As the owner, I want to unlink Google without losing all access to Cats.
- As a future workspace Admin, I want Cats to prevent removal of the final
  active Admin when account administration eventually ships.

## Requirements

### First-admin bootstrap

1. The real platform setup-completion route shall require all of:
   - owner display name;
   - non-empty Admin identifier;
   - local Admin password.
2. The route shall reject missing or partial Admin credentials with `400` and a
   stable structured error code. It shall not complete setup and rely on repair
   mode as an implicit Admin-creation flow.
3. During the promotion period, new local Admin and repair passwords shall be
   between 8 and 256 Unicode code points, inclusive. Cats shall allow spaces
   and password-manager output and shall not add composition rules such as
   mandatory uppercase, lowercase, digits, or symbols.
4. The password policy shall be enforced by the server-domain helper as well as
   reflected in the renderer. The renderer check is advisory; the server check
   is authoritative.
5. First-admin creation shall run inside a process-wide serialized setup
   critical section and shall recheck that no account or Admin membership exists
   inside the auth-store mutation that persists the new records.
6. Concurrent first-admin attempts shall produce exactly one successful Admin
   creation. Every loser shall receive a conflict response and shall not create
   another Account, Identity, Membership, or Session.
7. Setup state, owner profile, optional Guide Cat state, auth state, and the
   returned browser session shall remain logically atomic. A persistence failure
   shall not leave `setupCompleteAt` without a valid first Admin.
8. The standalone Google-only first-admin route, renderer wrapper, domain
   helper, public-route policy entry, and tests shall be removed. This is a
   clean pre-release contract change; no compatibility shim shall remain.
9. Repair mode shall continue to require its one-time recovery token and shall
   create a local-password Admin under the same password policy.

### Auth status and login-method projection

10. Authenticated `/api/auth/status` responses shall add a login-method
    projection derived from Identity records:

    ```ts
    interface PlatformLoginMethodsSummary {
      localPassword: {
        linked: boolean;
      };
      google: {
        linked: boolean;
        email: string | null;
      };
    }
    ```

11. Unauthenticated auth-status and minimal bootstrap responses shall return
    `loginMethods: null` or omit the field. They shall not disclose whether an
    account or provider identity exists.
12. Provider availability shall remain separate from linked state:
    `providers.google.enabled` means Cats can offer GIS on this server;
    `loginMethods.google.linked` means the authenticated account owns a Google
    Identity.
13. The server shall derive linked state from Identity records. The renderer
    shall not infer it from account email, avatar, local storage, or a prior
    login result.

### Local-password step-up

14. Cats shall expose an authenticated browser endpoint that accepts:

    ```ts
    interface PlatformAuthReauthenticationInput {
      password: string;
      purpose: 'link_google' | 'unlink_google';
    }
    ```

15. The endpoint shall require an active browser-cookie session, an allowlisted
    origin, and a valid Cats synchronizer CSRF token.
16. The endpoint shall verify the local-password Identity belonging to the
    current Account. It shall not accept an identifier supplied by the client.
17. Failed reauthentication shall use the existing local-login composite and
    aggregate throttle policy and a generic invalid-credential response.
18. Successful reauthentication shall issue a cryptographically random opaque
    action token with at least 256 bits of entropy and return it exactly once.
19. Cats shall store only a keyed hash of the action token. The grant shall be
    bound to `accountId`, `sessionId`, purpose, creation time, and expiration.
20. The default grant lifetime shall be five minutes. The grant shall not
    survive platform restart and shall be invalid when its browser session is
    expired or revoked.
21. A link/unlink route shall receive the action token through
    `X-Cats-Auth-Action`. A token in a URL or query string shall be rejected.
22. The server shall consume the grant on the first matching link/unlink
    attempt, whether that attempt succeeds or fails after grant validation.
23. A missing, expired, consumed, wrong-purpose, wrong-account, or wrong-session
    grant shall return `403` with `code: 'E_REAUTH_REQUIRED'`.
24. Raw passwords and action tokens shall never enter logs, auth-state files,
    app-shell payloads, URLs, browser local storage, or persisted product state.

### Google link

25. `POST /api/auth/google/link` shall be classified as a protected route
    before auth-route dispatch. Its handler shall still enforce its own
    sensitive-action checks defensively.
26. The route shall require, in order:
    - active Cats browser session;
    - allowlisted browser origin;
    - Cats CSRF token;
    - valid `link_google` action grant;
    - GIS `g_csrf_token` double-submit value;
    - server-verified Google ID token.
27. Google verification shall retain the SPEC-100 checks for signature,
    audience, issuer, expiration, verified email, and optional hosted domain.
28. The normalized verified Google email shall match the current Account's
    non-null normalized email. A mismatch shall return `409` with
    `code: 'E_IDENTITY_CONFLICT'` and shall not change Account or Identity
    state.
29. When the current Account email is `null`, a successful link may set it to
    the normalized verified Google email. This exception is allowed only after
    local-password step-up.
30. Cats shall use Google `sub` as `providerSubject`. It shall reject a `sub`
    linked to another Account and reject replacing a different Google Identity
    already linked to the current Account.
31. Re-linking the same Google `sub` to the same Account shall be idempotent and
    may refresh provider display email/avatar metadata.
32. Link success shall consume the action grant, rotate the current Cats CSRF
    token, persist the Identity/account update atomically, and return the
    updated auth-status projection.
33. Link failure after action-grant validation shall consume the action grant
    but shall not change Account, Identity, Membership, or Session state other
    than throttle/security-event records.

### Google login

34. Ordinary Google login shall continue to resolve only an existing Google
    Identity by stable `sub`.
35. Ordinary Google login shall not link by email, create an Account, create a
    Membership, promote an Admin, or replace an existing provider Identity.
36. Unknown Google identities shall receive a generic unauthenticated/unlinked
    response that does not disclose whether the verified email matches a Cats
    Account.

### Google unlink

37. Cats shall expose `POST /api/auth/google/unlink` as an authenticated
    browser mutation requiring origin, Cats CSRF, and a valid
    `unlink_google` action grant.
38. Unlink shall reject when no Google Identity is linked.
39. Unlink shall reject when the Account has no active local-password Identity
    or when removal would otherwise leave no usable login method.
40. Successful unlink shall remove only the current Account's Google Identity.
    It shall not delete the Account, Membership, local password, owner profile,
    or product data.
41. Successful unlink shall revoke every other browser and mobile Session for
    the Account, preserve the current step-up-verified browser Session, rotate
    its CSRF token, and return the updated auth-status projection.

### Settings UX

42. `Settings > General > Account` shall remain inside the existing
    `PlatformSettingsShell` and use the shared Settings composition primitives.
    It shall not add a nested Settings shell.
43. The Account section shall show:
    - current signed-in display name/email;
    - Local password with a linked status;
    - Google with linked, not linked, or unavailable status;
    - verified Google email when linked;
    - existing sign-out action.
44. When Google is configured and not linked, the section shall offer
    **Link Google account**. The action shall first open an accessible local-
    password modal, request a `link_google` grant, and only then initialize the
    GIS credential button/prompt.
45. When Google is linked and local password is available, the section shall
    offer **Unlink Google account**. It shall require a fresh password grant
    and a clear confirmation of other-session sign-out.
46. When the current origin cannot use Google GIS, the UI shall keep local
    login status visible and explain that linking must be performed from an
    authorized origin.
47. The renderer shall keep the action grant only in component memory. Route
    navigation, page reload, modal close, or completion shall discard it.
48. Success shall update the visible login-method projection immediately.
    Errors shall use the shared Toast system; Settings shall not render inline
    success or error feedback.
49. All new user-facing strings shall be present in English and Traditional
    Chinese catalogs and shall use message keys rather than raw JSX text.
50. The modal and Google controls shall be keyboard accessible, expose loading
    state, restore focus on close, and prevent duplicate submissions.

### Security events and future Admin safety

51. First-admin creation, step-up failure/success, Google link/unlink
    success/failure, and identity conflicts shall emit structured, secret-free
    security events through an injected reporter.
52. Security events shall include event kind, outcome, timestamp, account id
    when known, session id when known, and a bounded reason code. They shall not
    include passwords, raw action/session tokens, Google credentials, JWT
    claims, or full request bodies.
53. Any future Admin demotion, deactivation, or deletion mutation shall count
    active Admin memberships and reject the state transition when it would
    leave zero active Admins. The check and write shall be one serialized state
    mutation.

## Non-Functional Requirements

- **Security**: The backend, not the renderer, must enforce every link/unlink
  prerequisite. No sensitive token may be persisted client-side. The
  promotion-period password policy favors onboarding ease; the UI should
  recommend a longer passphrase without turning that recommendation into a
  blocking composition rule.
- **Local-first**: Setup, login, repair, and unlink must remain usable without
  Google after a local password has been established.
- **Privacy**: Cats stores Google `sub`, verified display email, and optional
  avatar metadata only. It does not store the received ID token.
- **Atomicity**: First-admin and identity mutations must not expose partial
  auth state after failures or concurrent requests.
- **Compatibility**: The product is pre-release. Remove the obsolete Google-
  only setup path instead of retaining aliases or compatibility shims.
- **Testability**: All route and renderer verification shall use isolated auth
  stores and fake Google verifiers/GIS adapters. Tests shall not mutate the
  user's real auth or product state and shall not call live Google.
- **UI consistency**: The Account section uses the existing Settings shell,
  shared Settings primitives, and Toast feedback contract.

## Design Overview

### First-admin flow

```text
/setup form
  -> origin gate
  -> validate identifier + password (8-256 Unicode code points)
  -> serialized setup/auth mutation
  -> Account + local Identity + owner/admin Membership + Session
  -> persist setup snapshot and auth state or roll back
  -> authenticated Cats shell
```

### Google link flow

```text
Settings Account section
  -> POST /api/auth/reauth { password, purpose: link_google }
  -> one-time action grant held in component memory
  -> GIS returns credential + g_csrf_token
  -> POST /api/auth/google/link
       Cats session + origin + Cats CSRF
       + action grant + GIS CSRF + verified Google token
       + email match/adoption + unique sub
  -> persist Identity, rotate Cats CSRF, return updated login methods
```

### Google unlink flow

```text
Settings Account section
  -> confirm other devices will sign out
  -> POST /api/auth/reauth { password, purpose: unlink_google }
  -> POST /api/auth/google/unlink with one-time action grant
  -> require local-password fallback
  -> remove Google Identity
  -> revoke other sessions + rotate current CSRF
  -> return updated login methods
```

## Acceptance Criteria

- [ ] Setup without either Admin identifier or password returns a structured
      `400` and leaves setup incomplete.
- [ ] Passwords shorter than 8 or longer than 256 Unicode code points are
      rejected by setup and repair domain helpers; an 8-code-point password is
      accepted and no uppercase/lowercase/digit/symbol composition rule is
      applied.
- [ ] Two concurrent first-admin submissions produce one Account, one local
      Identity, one owner/admin Membership, and one successful Session.
- [ ] The Google-only setup route and all direct production call paths are
      absent.
- [ ] Authenticated status reports local/Google linked state; unauthenticated
      status leaks no method state.
- [ ] Google link without a step-up grant, with an expired/consumed grant, or
      with a grant from another session/purpose returns
      `E_REAUTH_REQUIRED`.
- [ ] A mismatched verified Google email returns `E_IDENTITY_CONFLICT` without
      mutating Account or Identity state.
- [ ] An email-less local-handle Account adopts the verified Google email only
      after successful step-up-protected link.
- [ ] A Google `sub` owned by another Account cannot be linked.
- [ ] Ordinary Google login cannot create or email-claim an Account.
- [ ] Google unlink fails when no local fallback exists.
- [ ] Successful unlink preserves the current session, rotates its CSRF token,
      revokes every other Account session, and preserves all product data.
- [ ] Settings shows truthful linked/unlinked/unavailable states, uses a
      password modal before GIS, and reports errors only through Toast.
- [ ] English and Traditional Chinese UI tests cover the new Account strings.
- [ ] Security-event tests prove secret values do not enter reporter payloads.
- [ ] Targeted auth domain, route, renderer, i18n, and typecheck validations
      pass without live Google calls or writes to real user state.

## Dependencies

- [ADR-111](../decisions/111-keep-first-admin-local-and-require-step-up-for-google-linking.md)
- [ADR-096](../decisions/096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
- [SPEC-100](./SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)
- [ADR-072](../decisions/072-settings-composition-layer-in-design.md)
- [SPEC-073](./SPEC-073-settings-composition-layer.md)
- Existing platform auth store, session/CSRF helpers, throttle policy, Google
  verifier, GIS button, and Settings Account section

## Resolved Decisions

- [x] The User approved ADR-111's local-first-only bootstrap amendment on
      2026-09-02. Cats does not ship Google-only first-Admin bootstrap.
- [x] Google unlink revokes all other browser and mobile Sessions for the
      Account. Current Session records do not retain authenticating Identity
      provenance, so selective Google-session revocation would be unreliable.
- [x] During promotion, Admin passwords must contain 8 to 256 Unicode code
      points. Cats does not require uppercase/lowercase/digit/symbol
      composition.

## References

- [PLAN-104: Admin Bootstrap and Google Account Linking Rollout](../plans/PLAN-104-admin-bootstrap-and-google-account-linking-rollout.md)
- [Credential Vault Admin Bootstrap and Google Linking Reference](../research/2026-09-01-credential-vault-admin-and-google-linking-reference.md)
- [SPEC-100: Platform Authentication, Admin Bootstrap, and Google Identity](./SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)
- [Settings Composition Layer](./SPEC-073-settings-composition-layer.md)

---

*Created: 2026-09-01*
*Approved: 2026-09-02*
*Author: Codex, for User review*
*Related Plan: [PLAN-104](../plans/PLAN-104-admin-bootstrap-and-google-account-linking-rollout.md)*
