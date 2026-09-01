# PLAN-104: Admin Bootstrap and Google Account Linking Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft — implementation gated on ADR/SPEC approval |
| **Owner** | User |
| **Assigned To** | Unassigned |
| **Reviewer** | User |

## Related Spec

[SPEC-113: Admin Bootstrap and Google Account Linking](../specs/SPEC-113-admin-bootstrap-and-google-account-linking.md)

Related decision:
[ADR-111: Keep First-Admin Bootstrap Local and Require Step-Up for Google Linking](../decisions/111-keep-first-admin-local-and-require-step-up-for-google-linking.md)

## Overview

Deliver the follow-up in five reviewable phases:

```text
first-admin invariant
  -> login-method projection + one-time action grants
  -> hardened Google link/unlink routes
  -> Settings Account UX
  -> regression, docs, and owner acceptance
```

The implementation reuses the platform-owned auth boundary delivered by
PLAN-089. It does not introduce JWTs, a second OAuth stack, a new Settings
shell, or a new account table. The existing Google login route stays linked-
identity-only throughout the rollout.

No phase may write test, smoke, or verification data to the user's real auth or
product state. Use `MemoryPlatformAuthStore`, temporary directories, fake
Google verifiers, and fake GIS adapters.

## Approval Gate

Do not begin implementation until the User resolves these SPEC-113 choices:

- local-password identity is mandatory for every first Admin;
- the standalone Google-only setup route is removed;
- new/repair Admin passwords use a 12-character minimum;
- Google unlink revokes every other Account session.

Approval may accept the full draft or amend these points. Record any amendment
in ADR-111 and SPEC-113 before editing source.

## Implementation Phases

### Phase 1: First-Admin Bootstrap Invariant

- [ ] Task 1.1: Add one shared Admin-credential validator for setup and repair,
      including identifier normalization and the 12-to-256-code-point password
      policy.
- [ ] Task 1.2: Make Admin identifier and password mandatory in the real
      platform setup-completion request. Reject missing/partial credentials
      before mutating owner, Guide Cat, setup, or auth state.
- [ ] Task 1.3: Add a process-wide serialized setup critical section and move
      the final "no Account/Admin exists" check into the auth-store mutation
      that persists first-admin records.
- [ ] Task 1.4: Preserve logical rollback across chat/core setup snapshot and
      auth-state persistence. Add injected failure tests for both write orders.
- [ ] Task 1.5: Remove `/api/auth/google/setup`, its public-route exception,
      renderer API wrapper, Google first-admin domain helper/export, and tests
      that bless Google-only bootstrap.
- [ ] Task 1.6: Apply the same password validator to repair first-admin
      creation without weakening the existing recovery-token/origin boundary.
- [ ] Task 1.7: Add concurrency tests proving two simultaneous setup attempts
      cannot create two Admins or return two live sessions.

**Deliverables**: every real setup and repair path creates exactly one local
first Admin under one password policy; the unsupported Google-only bootstrap
surface no longer exists.

### Phase 2: Login-Method Projection and Action Grants

- [ ] Task 2.1: Add a domain helper that derives local-password and Google
      linked state for one Account from Identity records.
- [ ] Task 2.2: Extend authenticated auth status with `loginMethods`, keeping
      unauthenticated/minimal bootstrap responses non-disclosing.
- [ ] Task 2.3: Add an injected in-memory action-grant store with opaque
      256-bit tokens, keyed hashes, five-minute TTL, account/session/purpose
      binding, single consumption, bounded capacity, and restart invalidation.
- [ ] Task 2.4: Add `POST /api/auth/reauth` for local-password verification.
      Require browser session, origin, Cats CSRF, and one of the two bounded
      purposes.
- [ ] Task 2.5: Feed failed reauthentication into the existing local-login
      composite and aggregate throttle policy without logging password or
      action-token material.
- [ ] Task 2.6: Add stable `E_REAUTH_REQUIRED` and `E_IDENTITY_CONFLICT` codes
      to the shared auth error registry and renderer error mapping.
- [ ] Task 2.7: Add unit tests for expiry, first-use consumption, wrong purpose,
      wrong account/session, revoked session, capacity eviction, and secret-free
      reporter payloads.

**Deliverables**: the renderer can read truthful linked state and obtain a
server-bound, one-time capability only after verifying the current Account's
local password.

### Phase 3: Google Link and Unlink Domain/Routes

- [ ] Task 3.1: Update the Google-link domain helper to require exact normalized
      email match when Account email is non-null, adopt verified email only
      when Account email is null, preserve stable-`sub` uniqueness, and make
      same-Account/same-`sub` linking idempotent.
- [ ] Task 3.2: Classify `/api/auth/google/link` as protected in the platform
      auth gate and retain defensive session/origin/Cats-CSRF checks in the
      handler.
- [ ] Task 3.3: Require and consume a `link_google` action grant before GIS CSRF
      and verified-token binding completes. Keep the raw grant out of request
      URLs, logs, and state files.
- [ ] Task 3.4: Add `/api/auth/google/unlink` with local-fallback enforcement,
      `unlink_google` action grant, removal of only the Google Identity,
      revocation of every other Account session, and current-session CSRF
      rotation.
- [ ] Task 3.5: Return updated auth status/login methods after link and unlink.
- [ ] Task 3.6: Introduce an injected auth security-event reporter and emit
      bounded first-admin, step-up, identity-link, identity-unlink, and conflict
      outcomes.
- [ ] Task 3.7: Add route/domain tests for all guard-order branches, email-null
      adoption, email mismatch, cross-Account `sub` conflict, already-linked
      idempotence, no-local-fallback unlink, other-session revocation, and
      linked-only Google login.
- [ ] Task 3.8: Add a static regression proving no Google login path calls
      account-creation or email-claim helpers.

**Deliverables**: Google link/unlink is an explicit, atomic, step-up-protected
Account lifecycle; ordinary Google login remains unable to create or claim an
Account.

### Phase 4: Settings Account UX

- [ ] Task 4.1: Extend the renderer auth client with typed status methods,
      reauthentication, link, and unlink requests. Hold action grants only in
      component state.
- [ ] Task 4.2: Extract an Account authentication section under the platform
      renderer Settings tree and compose it inside the existing General page.
      Do not add another Settings shell or product-local copy.
- [ ] Task 4.3: Render local-password and Google status with shared
      `SettingsSection`, `SettingsOptionRow`, and `SettingsStatusChip`
      primitives, preserving the existing sign-out action.
- [ ] Task 4.4: Add an accessible local-password reauthentication dialog with
      focus trapping/restoration, loading state, submit deduplication, and
      discard-on-close action-token behavior.
- [ ] Task 4.5: After `link_google` step-up, render/initialize the existing GIS
      button adapter, post the credential with GIS CSRF + Cats CSRF + action
      grant, then refresh the account status.
- [ ] Task 4.6: Add unlink confirmation, explain that other devices will sign
      out, perform a fresh `unlink_google` step-up, and refresh status on
      success.
- [ ] Task 4.7: Use Toast for failures and no inline feedback. Stay silent on
      success when the linked-state row visibly updates.
- [ ] Task 4.8: Add English and Traditional Chinese messages for linked,
      unlinked, unavailable-origin, reauthentication, email conflict, unlink
      confirmation, and failure states.
- [ ] Task 4.9: Add focused renderer tests for each linked/provider state,
      password-before-GIS ordering, token disposal, duplicate-submit guard,
      Toast-only errors, focus behavior, and sign-out preservation.

**Deliverables**: the owner can see, link, and unlink Google from
`Settings > General > Account` through a truthful, localized, accessible flow.

### Phase 5: Documentation, Validation, and Handoff

- [ ] Task 5.1: Update API documentation with the new status projection,
      reauthentication endpoint, action-grant header, link/unlink behavior, and
      stable error codes; remove Google-only setup documentation.
- [ ] Task 5.2: Update setup and deployment guides with mandatory local Admin,
      password policy, authorized Google origin requirement, local fallback,
      and other-session revocation on unlink.
- [ ] Task 5.3: Update release notes and the relevant auth ADR/SPEC/PLAN status
      only after implementation and focused validation are complete.
- [ ] Task 5.4: Run targeted auth domain/route tests, setup/repair tests,
      Settings General/renderer auth tests, i18n catalog checks, and the full
      TypeScript typecheck.
- [ ] Task 5.5: Run browser and server production builds because the change
      crosses renderer/server imports. Escalate to broader tests only if a
      shared-contract or request-router regression warrants it.
- [ ] Task 5.6: Inspect the final diff for raw tokens, credentials, test data,
      source-only error text in JSX, duplicate Settings shells, and stale
      Google-setup references.
- [ ] Task 5.7: Ask the User for an owner acceptance pass on the real Google
      origin after automated fake-GIS coverage is green. Do not link/unlink the
      User's real account or mutate real auth state without that explicit
      action by the User.

**Deliverables**: implementation, documentation, and validation evidence are
complete without live-provider calls or agent-created state in the User's
workspace.

## Proposed Pull Request Slices

| PR | Scope | Merge gate |
|----|-------|------------|
| 1 | Phase 1 bootstrap invariant and Google-only setup removal | Setup/repair/concurrency tests + typecheck |
| 2 | Phase 2 action grants and login-method projection | Domain/route tests + typecheck |
| 3 | Phase 3 link/unlink hardening and security events | Auth route/domain regression set + typecheck |
| 4 | Phase 4 Settings UX and localization | Renderer/i18n tests + web/server builds |
| 5 | Phase 5 documentation/status reconciliation | Docs link/index checks and final targeted validation |

The split keeps security prerequisites ahead of the UI. Do not merge PR 4
against an unprotected link endpoint, even behind a hidden button.

## Files to Create/Modify

| Area | Action | Description |
|------|--------|-------------|
| `src/platform/auth/bootstrap.ts` | Modify | Mandatory credentials, shared password policy, serialized uniqueness contract |
| `src/platform/auth/googleAccount.ts` | Modify | Remove Google first-admin creation; harden link and add unlink helpers |
| `src/platform/auth/types.ts` | Modify | Login-method and any action/security-event contracts that belong in the domain |
| `src/platform/auth/*actionGrant*.ts` | Create | In-memory, hashed, purpose-bound one-time action grants |
| `src/app/server/authRoutes.ts` | Modify | Status, reauth, protected link, unlink, and security-event reporting |
| `src/app/server/authGatePolicy.ts` | Modify | Remove Google setup public route; protect link/unlink/reauth correctly |
| `src/app/server/platformSetupRoutes.ts` | Modify | Mandatory Admin and serialized setup operation |
| `src/app/renderer/auth/api.ts` | Modify | Typed reauth/link/unlink/status client |
| `src/app/renderer/auth/*Reauth*.tsx` | Create | Accessible local-password step-up dialog |
| `src/app/renderer/settings/PlatformSettingsGeneral.tsx` | Modify | Compose the Account authentication section once |
| `src/shared/i18n/messageKeys.ts` | Modify | New stable message keys |
| `src/shared/i18n/catalogs/{en,zh-TW}.ts` | Modify | Localized Account/link/unlink copy |
| `tests/platform-auth-*.test.tsx` | Modify/Create | Bootstrap, grants, link/unlink, status, and secret-boundary regressions |
| `tests/platform-settings-general.test.tsx` | Modify | Account status and step-up UX regressions |
| `docs/api.md` | Modify | Auth endpoint and error contracts |
| `docs/setup-guide.md` | Modify | Mandatory local Admin and Google linking workflow |
| `docs/deployment.md` | Modify | Origin/recovery/session-revocation behavior |
| `docs/release-notes.md` | Modify | Operator-facing behavior change |

Exact filenames may be refined during implementation, but the ownership
boundaries are fixed: auth domain stays under `src/platform/auth`, HTTP
integration stays in the platform server, and the Settings page remains under
the existing platform renderer shell.

## Technical Decisions

- Reuse GIS ID-token POST and its double-submit CSRF contract. Do not add a
  browser authorization-code flow, OAuth refresh token, `state`, or PKCE to
  this surface.
- Store action grants in an injected in-memory store because they are
  five-minute, one-time capabilities that should die on restart. Persist only
  auth identities and sessions.
- Bind the grant to purpose and session rather than using a broad
  `recentlyAuthenticatedAt` timestamp.
- Reclassify Google link/unlink as protected routes; their handlers still
  validate the sensitive-action requirements in depth.
- Normalize emails with trim + lowercase only. Do not implement provider-
  specific alias canonicalization.
- Revoke all other sessions on unlink because current Session records do not
  retain which Identity established them.
- Keep auth security events separate from Core Activity records so auth
  verification does not write product state.

## Testing Strategy

### Unit

- Password policy boundary and Unicode-code-point counting.
- First-admin uniqueness inside serialized mutation.
- Login-method projection.
- Action-grant issue/hash/expiry/binding/consume/capacity behavior.
- Google email match/null adoption/subject uniqueness/idempotence.
- Unlink fallback and session-revocation transformation.

### HTTP integration

- Origin + Cats CSRF + action grant + GIS CSRF guard ordering.
- Stable error codes and non-disclosure.
- Concurrent setup submissions.
- Link/unlink persistence failure rollback.
- Ordinary Google login remains linked-only.
- Unauthenticated status does not expose login methods.

### Renderer

- General Account section for Google disabled, unlinked, and linked.
- Password modal must succeed before GIS is initialized.
- Grant remains memory-only and is discarded on close/navigation.
- Email conflict and reauth errors use Toast, not inline feedback.
- Unlink confirmation and session-sign-out copy.
- English and Traditional Chinese catalog coverage.

### Build and state safety

- Run the narrow targeted suites plus `npm run typecheck`.
- Run `npm run build:web` and `npm run build:server` for browser/server boundary
  safety.
- Do not call live Google in automated tests.
- Do not POST to the running dev server or write the user's auth/chat/core state
  for verification.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Link route accepts a stolen session without true step-up | High | Purpose/session-bound, hashed, single-use action grant enforced server-side |
| Setup races create two Admins | High | Process-wide critical section plus uniqueness recheck inside auth-store mutation |
| Email mismatch silently changes account identity | High | Exact normalized match; null-email adoption is the only exception |
| Unlink strands the owner | High | Require active local-password fallback before mutation |
| Removed Google setup route breaks an unreleased caller | Low | Pre-release clean cut; remove wrappers/docs/tests together |
| Action grant leaks into browser persistence or logs | High | Component memory only, header transport, raw-token denylist tests, secret-free reporter |
| Unlink leaves Google-originated sessions active | High | Revoke every other Account session and rotate current CSRF |
| Settings UI duplicates navigation/chrome | Medium | Compose inside current General Account section and test one shell |
| Google origin unavailable on LAN/IP | Medium | Keep local path visible and show authorized-origin guidance |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-01 | Draft created from the current Cats auth baseline and the Credential Vault reference review; no implementation started. |

---

*Created: 2026-09-01*
*Author: Codex, for User review*
