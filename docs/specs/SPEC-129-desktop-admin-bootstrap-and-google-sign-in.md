# SPEC-129: Desktop Admin Bootstrap and Google Sign-In

## Metadata

| Field | Value |
| --- | --- |
| Status | Account core and Desktop native flow/UI implemented; publisher registration, live Google and packaged OS acceptance pending |
| Date | 2026-10-24 |
| Decision | [ADR-138](../decisions/138-converge-google-and-password-admin-bootstrap.md) |
| Delivery | [PLAN-122](../plans/PLAN-122-desktop-identity-and-remote-access-rollout.md) |
| Related scope | [SPEC-130](SPEC-130-desktop-managed-remote-access.md) |

## Summary

Let an uninitialized Cats Desktop profile create its first owner/Admin through
Google or email/password. Either account can later add the other login method
without changing its identity, authority or data. Desktop Google sign-in uses
the system browser and a local callback, independently of public remote access.
The owner authorized the first identity-contract/account-core implementation
batch and then the Desktop-native P2 slice on 2026-10-25. Native transport,
onboarding/login/account UI and configuration injection are implemented. The
publisher has no Desktop client ID yet; live Google acceptance and publication
remain separate delivery work.

## Baseline and replacement scope

- Delivered setup creates a local Admin and browser session; Google Web GIS
  login/link/unlink and ID-token verification already exist.
- Account/Identity/Membership/Session records can represent either login method.
  Existing Settings reports linked methods and uses password action grants.
- The Web client ID is optional; missing configuration hides the login button.
  A configured Web client is not a native Desktop OAuth client.
- This spec replaces SPEC-113's mandatory local first-admin credential and
  extends its step-up model. Unchanged session, CSRF, throttling, explicit
  linking and revocation contracts remain applicable.
- Credential Vault is a product-flow reference, not an implementation dependency.

## Goals and non-goals

Goals: two equivalent bootstrap paths, usable partial account states, deliberate
method completion, ordinary linked-identity sign-in, and recoverable failures.

Non-goals: remote Web onboarding/sign-in, a central authentication service,
public registration/invitations, Google API data access or offline Google
tokens, password changes/reset, removal of the final method, or changes to
provider CLI/API account authentication. Native Mobile Google UI expansion is
not required to complete this Desktop milestone.

## User journeys

| Journey | Required outcome |
| --- | --- |
| Choose Google in first-run setup | Open system browser; after verified success complete setup as Google-only owner/Admin |
| Choose email/password | Complete the same setup as password-only owner/Admin; no Google or tunnel dependency |
| Google-only Admin opens Account Settings | Show verified account email, Google linked, password absent, and Set password |
| Password-only Admin opens Account Settings | Show password present, Google unlinked, and Link Google when Desktop Google is available |
| Complete the missing method | Preserve Account ID, roles, owner mapping and data; both methods subsequently sign in |
| Google denied, cancelled, offline or unavailable | Keep the wizard usable and offer the email/password path; do not create a partial Admin |
| Initialized profile loses auth storage | Enter the existing guarded repair flow; ordinary Google login cannot claim Admin |

## Requirements

### First-admin initialization

| ID | Requirement |
| --- | --- |
| AUTH-01 | First-run setup offers Google and email/password as alternative methods. A successful Google path does not require creating a local password. |
| AUTH-02 | Google bootstrap uses a verified subject and verified email. New password bootstrap uses a valid normalized email; keep the existing 8-256 Unicode-code-point password policy without composition rules. |
| AUTH-03 | First-Admin authority belongs to a locally initiated Desktop onboarding transaction. A loopback source address, public URL, email match or arbitrary Google token alone cannot authorize bootstrap. |
| AUTH-04 | Both methods share the serialized first-admin check and auth/Core setup commit. Only the first successful commit wins; a concurrent loser gets a conflict without a second Account, Membership or owner actor. |
| AUTH-05 | Setup checks both uninitialized product state and absence of existing accounts/Admin authority inside the operation. Existing, disabled, missing or corrupt data must not silently reopen bootstrap. |
| AUTH-06 | Google callbacks may supply a short-lived provisional verified result before the wizard's final submission. It is bound to that setup attempt, not a reusable global credential. Cancel/expiry/restart discards it. |
| AUTH-07 | Completing either route issues the normal Cats session and owner/Admin membership mapped to the existing Core owner. Persist failures leave a consistent recoverable setup state; no completed setup without its Admin. |

### Native Google transaction

| ID | Requirement |
| --- | --- |
| AUTH-08 | Use a Google Desktop public client configured by the distributor. Do not silently reuse a Web/iOS/Android client, require every user to create a project, or bundle a confidential Web client secret. |
| AUTH-09 | Open the system browser. Desktop owns authorization-code exchange with PKCE S256, unpredictable state and OIDC nonce, on a short-lived loopback listener using an available port. Never target the tunnel origin. |
| AUTH-10 | Bind every transaction to its initiating profile, window/session or onboarding attempt, purpose, expected client and exact callback. Define a bounded expiry, cancellation and single-consumption rule before implementation. |
| AUTH-11 | Validate state before accepting a callback; exchange only the expected code with its verifier; verify Google signature, issuer, audience, expiry, nonce, non-empty stable subject and verified email. Preserve configured hosted-domain restrictions. |
| AUTH-12 | Bind callback paths/Host and loopback reachability to the listener actually opened; reject wrong transactions, duplicate/stale results and unrelated requests. A callback never creates a session for a different Desktop profile. |
| AUTH-13 | Platform receives a result through an authenticated private host seam and verifies/consumes its bound proof before mutating accounts or issuing Cats sessions. Client-supplied email/roles or an untrusted renderer success message are insufficient. |
| AUTH-14 | Codes, PKCE material, Google tokens and handoff grants remain transient and absent from logs, argv, URLs shared with consumers, transcripts, analytics and persisted normal settings. No Google refresh token is requested or retained. |
| AUTH-15 | Client registration, consent/publishing state and OS packaging support are independent readiness fields. Missing setup is reported truthfully; token-verifier fixtures do not establish live Google acceptance. |
| AUTH-16 | Post-setup Google sign-in resolves only an existing linked subject. Unknown subjects neither create accounts nor acquire Admin by matching an email. |

The first-batch contract below defines start, completion, cancellation and error
results for purposes `bootstrap`, `login`, `link_google` and `set_password`.
Completion is tied to the server/host-issued transaction, not a caller-selected
account ID. The P2 callback listener must close on success, cancellation, expiry
and full host exit.

### Frozen identity contract — first batch, 2026-10-25

The browser-safe contract is `src/shared/nativeGoogleAuth.ts`. P2 registers
these IPC/private routes. The sandbox preload mirrors only channel values and
imports types; a contract test checks alignment with the host.

| Boundary | Contract |
| --- | --- |
| Renderer -> trusted Desktop | `cats-host:google-auth-start`, `cats-host:google-auth-status`, `cats-host:google-auth-cancel`, `cats-host:google-auth-submit`. Start accepts a purpose, bootstrap `attemptId` or sensitive-purpose CSRF/password action grant. Status exposes a transaction ID, waiting/verified/cancelled/failed phase, expiry and optional `committing`. Submit chooses only the fixed bootstrap or first-password operation. |
| Private host -> Platform | `/api/desktop/auth/google/start`, `/complete`, `/cancel`, under the same `/api/desktop/auth/google` prefix. Require an ephemeral per-sidecar `x-cats-desktop-auth-key`; possession of a loopback address is insufficient. These paths must reject browser Origin requests and remain absent from public ingress. |
| Host-owned binding | Context comes from the trusted top-level window/profile registry. Platform derives an active Account/Session from the initiating Cats browser session for sensitive purposes; the renderer cannot choose them. Bootstrap also binds `attemptId`. `link_google` retains the existing current-password action grant at authorization. |
| Callback/code exchange | Host opens `http://127.0.0.1:<actual-port>/oauth/google/callback`, pins that exact URL, uses system-browser authorization code + PKCE S256 and checks state before exchange. Platform independently verifies the returned ID token with its pinned Desktop audience and server-issued nonce. |
| Private transaction lifetime | Five minutes from start, including verification and final consumption. At most 32 pending/verifying/ready transactions per profile. Starting again in one context supersedes its previous attempt/proof; other contexts remain isolated. |
| Completion | Receives transaction ID, exact callback URL, state and transient ID token over the private seam. For bootstrap/first-password, returns a random 256-bit deferred proof capability expiring no later than the transaction or ID token, without mutation. Login/link instead consume their proof inside the latest auth mutation immediately: login issues the ordinary Cats session; link checks the password grant/CSRF and returns refreshed status. |
| Final mutation | Trusted host attaches `x-cats-google-proof` and `x-cats-desktop-auth-context`. Bootstrap additionally checks the submitted `attemptId`; first-password checks the current Account/Session and linked subject/email inside the serialized mutation. Never accept proof through a URL or caller-supplied identity/role fields. |
| Invalidation | First recognized proof use spends it, including a binding mismatch or later validation/write failure. Cancellation, replacement, reset, process exit/restart and expiry invalidate it; async verification cannot resurrect a cancelled transaction. |

Nonces, state, PKCE material, ID tokens and final-mutation capabilities stay in
the private host/Platform path, outside renderer IPC/status and diagnostics.
The P1 in-memory proof store exposes `begin`/`complete` only to trusted in-process
callers; injected test verifiers exercise that seam. Consumers receive only
the consume/revoke/reset interface. Store instances and pinned configuration
are profile-specific; proofs do not cross instances or survive restart.

P2 distribution configuration uses a publisher-owned **Desktop** client through
`CATS_AUTH_GOOGLE_DESKTOP_CLIENT_ID`, with no fallback to Web GIS or Mobile client
IDs. Source development can use the environment override; packaging writes the
public value into `config/google-desktop-oauth.json` under the packaged Platform
config directory. Desktop release builds read repository variable
`GOOGLE_DESKTOP_CLIENT_ID`. No client secret is required or stored.
Actual publisher registration, consent/publishing state, live test-account
availability and callback acceptance on each OS remain **unverified**. Missing
injected Desktop configuration fails closed as `not_configured`; no Google Cloud
project/account was changed by this batch. The native public-client and OIDC
choices follow Google's [Desktop OAuth documentation](https://developers.google.com/identity/protocols/oauth2/native-app)
and [OIDC verification contract](https://developers.google.com/identity/openid-connect/openid-connect).

### Login-method completion

| ID | Requirement |
| --- | --- |
| AUTH-17 | Store both methods as separate Identities on the existing Account, not placeholder Google IDs, a second Admin, email-based merge or replacement account. Roles never depend on which method logged in. |
| AUTH-18 | Google-only first-password setup derives the local login email from the existing verified account. The form cannot silently choose a different email or overwrite an existing password. |
| AUTH-19 | Setting that password requires a fresh Google transaction for the already-linked subject and a short-lived, single-use action proof bound to Account, current Cats session and `set_password`. A valid old session/token alone is insufficient. |
| AUTH-20 | Linking Google from a local account retains current-password step-up, Cats CSRF, a purpose-bound grant, verified matching normalized email and unique Google subject. Check the grant at the mutation, not only in UI sequencing. |
| AUTH-21 | Trim/lowercase email comparison; no Gmail dot/plus alias equivalence. A legacy handle account with no email may adopt the verified email through explicit existing step-up linking, without rewriting its login handle. |
| AUTH-22 | Reject a subject owned by another Account, another subject already linked to this Account, local login-identifier collisions and different verified email. Retry must not duplicate identities or mutate the other account. |
| AUTH-23 | Preserve at least one usable login method. Google unlink requires the local fallback, consumes current-password proof, revokes the other Account sessions and retains/rotates the current session as established by SPEC-113. |
| AUTH-24 | Emit secret-free security events for bootstrap, login-method addition, conflicts, failed proof and unlink. Method completion preserves Account ID, owner mapping, roles and existing product data. |

### UX, sessions and compatibility

| ID | Requirement |
| --- | --- |
| AUTH-25 | Account Settings shows password absent/present and Google absent/linked/unavailable from server-owned Identity state, never inferred from email/avatar. Compose into the existing Settings shell and use its Toast feedback. |
| AUTH-26 | Prompt a Google-created Admin to add an optional offline login password without blocking completion or relabeling it as a lower-privilege account. Cancellation leaves the current usable method intact. |
| AUTH-27 | Browser sessions keep HttpOnly cookies, synchronizer CSRF and origin gates. Mobile keeps separate device bearer sessions and audience/nonce checks. OAuth completion does not convert one session kind into the other implicitly. |
| AUTH-28 | Existing local accounts, hashes, handles, Google links, device sessions, memberships and owned data remain usable. No blanket reset, automatic identity conversion or forced Google relink is permitted. |
| AUTH-29 | Do not assume a schema bump is needed. If any persisted/CLI/API contract must change, classify compatibility first; test validation, backup, atomic activation and restart/failure recovery. Breaking 0.x contracts require the next minor at an authorized release. |
| AUTH-30 | Remote access is independent and defaults off. Neither Google bootstrap nor offline password login starts ngrok/Funnel, creates a public callback, or requires a public domain. |

## Acceptance scenarios

| ID | Evidence required |
| --- | --- |
| A1 | Fresh isolated profile: Google -> Admin -> first password -> sign out -> both methods reach the same Account and owner data |
| A2 | Fresh isolated profile: email/password -> explicit same-email Google link -> both methods; compare capabilities/roles to A1 |
| A3 | Google-only remains a valid Admin; password-only works offline with every tunnel off |
| A4 | Concurrent Google/password initialization has exactly one winner; injected storage failures preserve recoverability |
| A5 | Wrong state/nonce/audience/subject, replay, cancelled browser and expired handoff cause no account/session mutation |
| A6 | Email mismatch, duplicate identity, stolen-session-only password addition and last-method unlink are rejected |
| A7 | Upgrade a pre-change local/handle/Google-linked profile; retained session and owner-data behavior is unchanged |
| A8 | Packaged Windows/macOS/Linux system-browser callback, completion, cancellation and listener cleanup; report each OS independently |
| A9 | Missing distributor client configuration and live Google consent/account restrictions produce actionable readiness without fabricated success |

Only A8/A9 with a real registered client can establish live OAuth readiness.
Use dedicated operator-approved test profiles/accounts for provider checks.
No fixtures or verification accounts are written into the user's working profile.

## Remaining acceptance gates

- Register the publisher Desktop client and consent/test-account policy. This was
  explicitly deferred by the owner; an unconfigured distribution reports
  `not_configured`, keeps local setup/login usable and never fabricates Google
  readiness. Configured source is not a claim that consent is published.
- Prove loopback delivery and Google ID-token/nonce handling for the chosen
  library and Desktop OAuth client on every supported package target.
- Record live acceptance independently for Windows/macOS/Linux packages. Existing
  operator-configured GIS remains available when native Google is unavailable;
  Desktop uses the native flow when configured. Web origins are not widened.

## Desktop lifecycle and UI implementation

- Only the trusted top-level app frame may use native IPC. The host creates a
  per-process key, passes it only to Platform, and excludes it from Runtime and
  project children. Private HTTP requires that key, loopback and no Origin;
  dedicated ingress continues denying the private prefix/headers.
- Native cancellation includes a start whose ID has not returned. Generation
  checks fence late starts, verification and final submits. Exact transaction +
  context cancellation cannot invalidate a replacement. Callback listeners and
  transient material close before the bounded one-second cancellation request.
- Cats cookie publication is a non-cancellable commit: status reports
  `committing`, new starts and UI cancellation are blocked, and transaction
  expiry cannot report a successful publication as cancelled. Full exit can
  drain local resources without waiting indefinitely for cookie publication.
- Google bootstrap stays provisional through the existing provider/Catlas
  selection step. Only the final setup action creates the account/session.
  New local setup requires an email; existing handle login/repair remains valid.
- Google-only Account Settings derives its email from the server and offers an
  optional first password after fresh native Google verification. Password-first
  accounts retain password step-up before native linking. Settings feedback uses
  Toast. Mobile/remote Web can use a local password once added; native Mobile
  Google UI and remote Web product delivery remain separately deferred.
- No schema/version/migration changes, normal-profile reset or tunnel startup
  are part of P2. Existing conversation and Runtime files are byte-compared in
  the isolated password-profile upgrade regression.

## First-batch implementation and compatibility

- One first-Admin factory now creates local or verified-Google identities with
  the same Account/Membership/session rules. `/api/platform/setup/complete` adds
  `adminMethod: 'google'` and consumes a bound proof inside its auth mutation.
  Omitted/`local_password` retains the existing identifier/password contract;
  P2's new-account UI will require email while existing handle profiles/repair
  remain usable. Disabled accounts and orphan auth records cannot reopen setup.
- `POST /api/auth/password/first` accepts only `{ password }`, an active browser
  cookie, Cats CSRF and a `set_password` Google proof. It derives the login email
  from the existing verified account, rejects overwrite/collisions and rotates
  CSRF. The existing password-based `/api/auth/reauth` cannot mint this proof.
- Web and Mobile Google login now commit against the latest serialized state,
  preserving a password concurrently added by the first-password operation.
  Missing-file initialization uses the same mutation lock as first-Admin creation.
- Auth files remain version **1**, with unchanged identity/hash/session formats.
  Replacement writes use an owner-permission temporary file and same-directory
  rename. No data migration, API removal, version bump or release is introduced.
- Caught Core snapshot failure rolls back the provisional auth state and spends
  its proof; retry needs a new Google transaction. A hard process death between
  the separate auth/Core commits remains **fail-closed incomplete setup** using
  existing authenticated repair/reset procedures; this batch does not add an
  automatic cross-file recovery journal or reopen first-claim authority.

The PLAN-122 checkpoint records executed checks and independent source review.
A1-A7 account/authorization behavior is exercised with isolated stores and
injected verifiers; these are not live Desktop Google or packaged-OS acceptance.

## References

- [SPEC-113: Existing Admin/linking baseline](SPEC-113-admin-bootstrap-and-google-account-linking.md)
- [SPEC-100: Sessions and Google identity foundation](SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)
- [Reference and primary-source review](../research/2026-09-01-credential-vault-admin-and-google-linking-reference.md#2026-10-24-follow-up-dual-bootstrap-and-managed-remote-access)

*Last updated: 2026-10-25*
